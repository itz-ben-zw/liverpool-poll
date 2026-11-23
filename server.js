const express = require("express");
const { Pool } = require("pg");
const crypto = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for STND PostgreSQL.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
pool.on("error", e => console.error("[database] pool error:", e.code || "unknown"));
const ADMIN_EMAIL = String(process.env.STND_ADMIN_EMAIL || "").trim().toLowerCase();
const SUPABASE_URL = String(process.env.SUPABASE_URL || "https://llfywhxskldofuhtfjmv.supabase.co").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PRODUCT_IMAGE_BUCKET = "stnd-product-images";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || (process.env.NODE_ENV === "production" ? "https://stnd-store.onrender.com/auth/google/callback" : "http://localhost:3000/auth/google/callback");
const COOKIE = "stnd_session";
const SESSION_DAYS = 7;
const PAY_KEY = process.env.PESEPAY_INTEGRATION_KEY || "";
const PAY_ENCRYPTION = process.env.PESEPAY_ENCRYPTION_KEY || "";
const PAY_LIVE = process.env.PESEPAY_ENVIRONMENT === "live";
const PAY_URL = PAY_LIVE ? "https://api.pesepay.com/api/payments-engine/v1" : "https://api.test.sandbox.pesepay.com/payments-engine/v1";
const APP_URL = process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:" + PORT;
const payReady = () => Boolean(PAY_KEY && PAY_ENCRYPTION.length === 32);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

const validText = (v, n=500) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= n;
const validEmail = v => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const hash = v => crypto.createHash("sha256").update(v).digest("hex");
const cleanUser = u => u && ({ id:Number(u.id), name:u.name, email:u.email, role:u.role, createdAt:u.created_at, address:u.address || "", phone:u.phone || "" });
const cleanProduct = p => ({ ...p, images:Array.isArray(p.images)?p.images:(p.image?[p.image]:[]), id:Number(p.id), price:Number(p.price), stock:Number(p.stock), featured:Boolean(p.featured), active:p.status === "active" });
const passwordHash = (p, salt=crypto.randomBytes(16).toString("hex")) => salt + ":" + crypto.scryptSync(p,salt,64).toString("hex");
function passwordMatches(p, stored) {
  if (!stored) return false;
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const a=Buffer.from(crypto.scryptSync(p,salt,64).toString("hex"),"hex"), b=Buffer.from(expected,"hex");
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function cookieOpts(age) { return ["Path=/","HttpOnly","SameSite=Lax","Max-Age="+age,...(process.env.NODE_ENV==="production"?["Secure"]:[])].join("; "); }
function readCookie(req,name) {
  for (const p of String(req.headers.cookie||"").split(";")) { const i=p.indexOf("="); if(i>=0&&p.slice(0,i).trim()===name)return decodeURIComponent(p.slice(i+1).trim()); }
  return null;
}
function setCookie(res,token) { res.setHeader("Set-Cookie",COOKIE+"="+encodeURIComponent(token)+"; "+cookieOpts(SESSION_DAYS*86400)); }
function clearCookie(res) { res.setHeader("Set-Cookie",COOKIE+"=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"+(process.env.NODE_ENV==="production"?"; Secure":"")); }
async function createSession(client,userId) {
  const token=crypto.randomBytes(32).toString("base64url");
  await client.query("insert into public.sessions(user_id,token_hash,expires_at) values($1,$2,$3)",[userId,hash(token),Date.now()+SESSION_DAYS*86400000]);
  return token;
}
async function getSession(token,client=pool) {
  if(!token)return null;
  const r=await client.query("select u.id,u.name,u.email,u.role,u.created_at,c.address,c.phone from public.sessions s join public.users u on u.id=s.user_id left join public.customers c on lower(c.email)=lower(u.email) where s.token_hash=$1 and s.expires_at>$2",[hash(token),Date.now()]);
  return r.rows[0]||null;
}
async function auth(req,res,next) {
  try { req.user=await getSession(readCookie(req,COOKIE)); if(!req.user){clearCookie(res);return res.status(401).json({error:"Please sign in to continue."});} next(); }
  catch(e){next(e);}
}
const adminOnly=(req,res,next)=>req.user.role==="admin"?next():res.status(403).json({error:"STND admin access is required."});
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function googleClient(){return GOOGLE_CLIENT_ID&&GOOGLE_CLIENT_SECRET?new OAuth2Client(GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,GOOGLE_REDIRECT_URI):null;}
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string")return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function clearGoogle(res){const s=process.env.NODE_ENV==="production"?"; Secure":"";["stnd_state","stnd_nonce"].forEach(n=>res.append("Set-Cookie",n+"=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"+s));}
function encryptPay(value){const c=crypto.createCipheriv("aes-256-cbc",Buffer.from(PAY_ENCRYPTION),Buffer.from(PAY_ENCRYPTION.slice(0,16)));return Buffer.concat([c.update(JSON.stringify(value),"utf8"),c.final()]).toString("base64");}
function decryptPay(value){const d=crypto.createDecipheriv("aes-256-cbc",Buffer.from(PAY_ENCRYPTION),Buffer.from(PAY_ENCRYPTION.slice(0,16)));return JSON.parse(Buffer.concat([d.update(Buffer.from(value,"base64")),d.final()]).toString("utf8"));}
async function payRequest(url,options={}){const r=await fetch(url,{...options,headers:{authorization:PAY_KEY,"content-type":"application/json",...(options.headers||{})}});const body=await r.json().catch(()=>({}));if(!r.ok)throw Error(body.message||body.error||"Pesepay request failed.");return body;}
async function startPayment(orderId,total){
  const payload=encryptPay({amountDetails:{amount:Number(total.toFixed(2)),currencyCode:"USD"},reasonForPayment:"STND. order #"+orderId,merchantReference:"STND-"+orderId,resultUrl:APP_URL+"/payments/pesepay/result",returnUrl:APP_URL+"/payment/return?order="+orderId});
  const body=await payRequest(PAY_URL+"/payments/initiate",{method:"POST",body:JSON.stringify({payload})});
  if(!body.payload)throw Error("Pesepay response missing payload.");
  const data=decryptPay(body.payload);
  if(!data.referenceNumber||!data.redirectUrl)throw Error("Pesepay checkout response incomplete.");
  await pool.query("update public.orders set payment_reference=$1,payment_provider='pesepay',status='pending_payment',payment_status='pending',updated_at=now() where id=$2",[data.referenceNumber,orderId]);
  return data;
}
async function checkPayment(ref){
  const u=new URL(PAY_URL+"/payments/check-payment");u.searchParams.set("referenceNumber",ref);
  const body=await payRequest(u.toString());if(!body.payload)throw Error("Payment status response incomplete.");return decryptPay(body.payload);
}
async function settlePayment(data){
  const c=await pool.connect();
  try{
    await c.query("begin");
    const found=await c.query("select * from public.orders where payment_reference=$1 for update",[data.referenceNumber]);
    const o=found.rows[0];if(!o){await c.query("commit");return {ignored:true};}
    if(o.payment_status==="paid"){await c.query("commit");return {alreadyPaid:true};}
    const amount=Number(data.amountDetails?.amount),currency=String(data.amountDetails?.currencyCode||"").toUpperCase();
    if(currency!=="USD"||!Number.isFinite(amount)||Math.abs(amount-Number(o.total))>.009)throw Error("Payment amount/currency mismatch.");
    if(data.transactionStatus==="SUCCESS"){await c.query("update public.orders set status='paid',payment_status='paid',updated_at=now() where id=$1",[o.id]);}
    else if(["FAILED","CANCELLED","REVERSED","EXPIRED"].includes(String(data.transactionStatus||"").toUpperCase())){
      const changed=await c.query("update public.orders set status='payment_failed',payment_status='failed',updated_at=now() where id=$1 and payment_status='pending' returning id",[o.id]);
      if(changed.rowCount){const items=await c.query("select product_id,quantity from public.order_items where order_id=$1",[o.id]);for(const i of items.rows)await c.query("update public.products set stock=stock+$1,updated_at=now() where id=$2",[i.quantity,i.product_id]);}
    }
    await c.query("commit");return {status:data.transactionStatus||"PENDING",orderId:Number(o.id)};
  }catch(e){await c.query("rollback");throw e;}finally{c.release();}
}
async function restoreOrder(orderId){
  const c=await pool.connect();
  try{await c.query("begin");const changed=await c.query("update public.orders set status='payment_failed',payment_status='failed',updated_at=now() where id=$1 and payment_status='pending' returning id",[orderId]);if(changed.rowCount){const rows=await c.query("select product_id,quantity from public.order_items where order_id=$1",[orderId]);for(const i of rows.rows)await c.query("update public.products set stock=stock+$1,updated_at=now() where id=$2",[i.quantity,i.product_id]);}await c.query("commit");}
  catch(e){await c.query("rollback");console.error("[orders] stock restore failed:",e.code||"unknown");}finally{c.release();}
}
async function recordDemoPayment(orderId,method,outcome){
  const c=await pool.connect();
  const reference="STND-"+method.toUpperCase()+"-"+orderId+"-"+crypto.randomBytes(4).toString("hex").toUpperCase();
  try{
    await c.query("begin");
    const found=await c.query("select id,payment_status from public.orders where id=$1 for update",[orderId]);
    if(!found.rowCount)throw Error("Order not found.");
    if(found.rows[0].payment_status==="paid"){await c.query("commit");return {status:"paid",reference};}
    if(outcome==="success"){
      await c.query("update public.orders set payment_reference=$1,payment_provider=$2,status='paid',payment_status='paid',updated_at=now() where id=$3",[reference,method,orderId]);
    }else{
      const changed=await c.query("update public.orders set payment_reference=$1,payment_provider=$2,status='payment_failed',payment_status='failed',updated_at=now() where id=$3 and payment_status='pending' returning id",[reference,method,orderId]);
      if(changed.rowCount){
        const rows=await c.query("select product_id,quantity from public.order_items where order_id=$1",[orderId]);
        for(const item of rows.rows)await c.query("update public.products set stock=stock+$1,updated_at=now() where id=$2",[item.quantity,item.product_id]);
      }
    }
    await c.query("commit");
    return {status:outcome==="success"?"paid":"failed",reference};
  }catch(e){await c.query("rollback");throw e;}finally{c.release();}
}

app.post("/api/admin/uploads",auth,adminOnly,express.raw({type:["image/jpeg","image/png","image/webp","image/avif"],limit:"10mb"}),asyncRoute(async(req,res)=>{
  if(!SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:"Image uploads are not configured. Add SUPABASE_SERVICE_ROLE_KEY to Render."});
  const mime=req.get("content-type")||"",buffer=req.body;
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>10*1024*1024)return res.status(400).json({error:"Choose an image smaller than 10 MB."});
  const signatures={"image/jpeg":buffer[0]===255&&buffer[1]===216&&buffer[2]===255,"image/png":buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),"image/webp":buffer.toString("ascii",0,4)==="RIFF"&&buffer.toString("ascii",8,12)==="WEBP","image/avif":/ftypavis|ftypavif/.test(buffer.toString("ascii",4,16))};
  if(!signatures[mime])return res.status(415).json({error:"Use a valid JPEG, PNG, WebP or AVIF image."});
  const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif"}[mime],objectPath="products/"+Date.now()+"-"+crypto.randomBytes(8).toString("hex")+"."+ext;
  const uploaded=await fetch(SUPABASE_URL+"/storage/v1/object/"+PRODUCT_IMAGE_BUCKET+"/"+objectPath,{method:"POST",headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+SUPABASE_SERVICE_ROLE_KEY,"content-type":mime,"cache-control":"public, max-age=31536000","x-upsert":"false"},body:buffer});
  if(!uploaded.ok){const detail=await uploaded.json().catch(()=>({}));console.error("[storage] upload failed:",uploaded.status,detail.error||detail.message||"unknown");return res.status(502).json({error:"Image upload failed. Please try again."});}
  res.status(201).json({url:SUPABASE_URL+"/storage/v1/object/public/"+PRODUCT_IMAGE_BUCKET+"/"+objectPath});
}));
app.get("/api/health",asyncRoute(async(req,res)=>{await pool.query("select 1");res.json({status:"ok",database:"supabase-postgresql",payments:payReady()?"configured":"manual-order-mode",imageUploads:SUPABASE_SERVICE_ROLE_KEY?"configured":"not-configured"});}));
app.post("/api/auth/register",asyncRoute(async(req,res)=>{
  const {name,email,password}=req.body||{},mail=String(email||"").trim().toLowerCase();
  if(!validText(name,100)||!validEmail(mail)||typeof password!=="string"||password.length<8||password.length>200)return res.status(400).json({error:"Enter your name, a valid email and a password of at least 8 characters."});
  if(ADMIN_EMAIL&&mail===ADMIN_EMAIL)return res.status(403).json({error:"The store administrator must use verified Google sign-in."});
  const c=await pool.connect();try{await c.query("begin");const r=await c.query("insert into public.users(name,email,password_hash,role) values($1,$2,$3,'customer') returning id,name,email,role,created_at",[name.trim(),mail,passwordHash(password)]);const token=await createSession(c,r.rows[0].id);await c.query("commit");setCookie(res,token);res.status(201).json({user:cleanUser(r.rows[0]),message:"Your STND. account is ready."});}
  catch(e){await c.query("rollback");if(e.code==="23505")return res.status(409).json({error:"An account with that email already exists. Sign in instead."});throw e;}finally{c.release();}
}));
app.post("/api/auth/login",asyncRoute(async(req,res)=>{
  const {email,password}=req.body||{};if(!validEmail(email)||typeof password!=="string")return res.status(400).json({error:"Enter your email and password."});
  const r=await pool.query("select u.*,c.address,c.phone from public.users u left join public.customers c on lower(c.email)=lower(u.email) where lower(u.email)=lower($1) limit 1",[email.trim()]);
  const u=r.rows[0];if(!u||!passwordMatches(password,u.password_hash))return res.status(401).json({error:"Email or password is incorrect."});
  setCookie(res,await createSession(pool,u.id));res.json({user:cleanUser(u),message:"Signed in successfully."});
}));
app.get("/auth/google",(req,res)=>{
  const client=googleClient();if(!client)return res.redirect("/?google=setup#account");
  const state=crypto.randomBytes(32).toString("base64url"),nonce=crypto.randomBytes(32).toString("base64url"),secure=process.env.NODE_ENV==="production"?"; Secure":"";
  res.append("Set-Cookie","stnd_state="+state+"; Path=/; HttpOnly; SameSite=Lax; Max-Age=600"+secure);
  res.append("Set-Cookie","stnd_nonce="+nonce+"; Path=/; HttpOnly; SameSite=Lax; Max-Age=600"+secure);
  res.redirect(client.generateAuthUrl({access_type:"online",prompt:"select_account",scope:["openid","email","profile"],state,nonce}));
});
app.get("/auth/google/callback",asyncRoute(async(req,res)=>{
  const client=googleClient(),state=readCookie(req,"stnd_state"),nonce=readCookie(req,"stnd_nonce"),valid=safeEqual(String(req.query.state||""),state);clearGoogle(res);
  if(!client||!valid||!nonce||typeof req.query.code!=="string"||req.query.error)return res.redirect("/?google=failed#account");
  const {tokens}=await client.getToken(req.query.code);if(!tokens.id_token)throw Error("Google ID token missing.");
  const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:GOOGLE_CLIENT_ID}),profile=ticket.getPayload();
  if(!profile?.sub||!profile.email||profile.email_verified!==true||!safeEqual(String(profile.nonce||""),nonce))throw Error("Google verification failed.");
  const mail=profile.email.toLowerCase(),isAdmin=Boolean(ADMIN_EMAIL&&mail===ADMIN_EMAIL),c=await pool.connect();
  try{await c.query("begin");let q=await c.query("select * from public.users where google_sub=$1 or lower(email)=lower($2) limit 1 for update",[profile.sub,mail]);let u=q.rows[0];
    if(u){if(u.google_sub&&u.google_sub!==profile.sub)throw Error("Google account conflict.");q=await c.query("update public.users set google_sub=$1,role=case when $2 then 'admin' else role end,updated_at=now() where id=$3 returning id,name,email,role,created_at",[profile.sub,isAdmin,u.id]);u=q.rows[0];}
    else{q=await c.query("insert into public.users(name,email,google_sub,role) values($1,$2,$3,$4) returning id,name,email,role,created_at",[String(profile.name||mail).slice(0,100),mail,profile.sub,isAdmin?"admin":"customer"]);u=q.rows[0];}
    const token=await createSession(c,u.id);await c.query("commit");setCookie(res,token);res.redirect("/?google=success");
  }catch(e){await c.query("rollback");throw e;}finally{c.release();}
}));
app.post("/api/auth/logout",asyncRoute(async(req,res)=>{const token=readCookie(req,COOKIE);if(token)await pool.query("delete from public.sessions where token_hash=$1",[hash(token)]);clearCookie(res);res.json({message:"Signed out."});}));
app.get("/api/auth/me",auth,(req,res)=>res.json({user:cleanUser(req.user)}));

app.get("/api/products",asyncRoute(async(req,res)=>{const r=await pool.query("select p.id,p.name,p.description,p.price,p.image,p.images,p.slug,p.sku,p.category,p.audience,p.stock,p.status,p.featured,p.created_at,coalesce(rv.average_rating,0)::numeric(3,2) as average_rating,coalesce(rv.review_count,0)::int as review_count,coalesce(sales.popularity,0)::int as popularity from public.products p left join (select product_id,round(avg(rating)::numeric,2) as average_rating,count(*) as review_count from public.product_reviews group by product_id) rv on rv.product_id=p.id left join (select oi.product_id,sum(oi.quantity) as popularity from public.order_items oi join public.orders o on o.id=oi.order_id where o.payment_status='paid' group by oi.product_id) sales on sales.product_id=p.id where p.status='active' and p.stock>0 order by p.featured desc,p.created_at desc,p.id desc");res.json(r.rows.map(cleanProduct));}));

app.use("/api/assistant", require("./ai-assistant")(pool));

app.get("/api/products/:id/reviews",asyncRoute(async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Invalid product."});const viewer=await getSession(readCookie(req,COOKIE));const r=await pool.query("select pr.id,pr.rating,pr.title,pr.body,pr.created_at,(pr.user_id=$2) as is_own,exists(select 1 from public.order_items oi join public.orders o on o.id=oi.order_id where oi.product_id=pr.product_id and o.user_id=pr.user_id and o.payment_status='paid') as verified_purchase,split_part(u.name,' ',1) as customer_name from public.product_reviews pr join public.users u on u.id=pr.user_id where pr.product_id=$1 order by pr.created_at desc limit 50",[id,viewer?.id||null]);res.json({reviews:r.rows});}));
app.post("/api/products/:id/reviews",auth,asyncRoute(async(req,res)=>{const id=Number(req.params.id),rating=Number(req.body?.rating),title=String(req.body?.title||"").trim(),body=String(req.body?.body||"").trim();if(!Number.isInteger(id)||id<1||!Number.isInteger(rating)||rating<1||rating>5||!validText(body,1500)||title.length>100)return res.status(400).json({error:"Choose a rating and write a review of up to 1,500 characters."});const product=await pool.query("select id from public.products where id=$1 and status='active'",[id]);if(!product.rowCount)return res.status(404).json({error:"Product not found."});try{await pool.query("insert into public.product_reviews(product_id,user_id,rating,title,body) values($1,$2,$3,$4,$5)",[id,req.user.id,rating,title||null,body]);res.status(201).json({message:"Thank you. Your review has been published."})}catch(e){if(e.code==="23505")return res.status(409).json({error:"You have already reviewed this product."});throw e}}));
app.delete("/api/products/:id/reviews/:reviewId",auth,asyncRoute(async(req,res)=>{const productId=Number(req.params.id),reviewId=Number(req.params.reviewId);if(!Number.isSafeInteger(productId)||productId<1||!Number.isSafeInteger(reviewId)||reviewId<1)return res.status(400).json({error:"Invalid review."});const r=await pool.query("delete from public.product_reviews where id=$1 and product_id=$2 and user_id=$3 returning id",[reviewId,productId,req.user.id]);if(!r.rowCount)return res.status(404).json({error:"Review not found or it does not belong to your account."});res.json({message:"Your review has been deleted."});}));
app.post("/api/reviews/:reviewId/report",auth,asyncRoute(async(req,res)=>{const reviewId=Number(req.params.reviewId),reason=String(req.body?.reason||""),details=String(req.body?.details||"").trim();const allowed=["spam","harassment","hate_speech","profanity","misleading","other"];if(!Number.isSafeInteger(reviewId)||reviewId<1||!allowed.includes(reason)||details.length>500)return res.status(400).json({error:"Choose a valid report reason. Details must be 500 characters or fewer."});const found=await pool.query("select id,product_id,user_id,title,body from public.product_reviews where id=$1",[reviewId]);if(!found.rowCount)return res.status(404).json({error:"This review is no longer available."});const review=found.rows[0];if(Number(review.user_id)===Number(req.user.id))return res.status(400).json({error:"You cannot report your own review."});try{await pool.query("insert into public.product_review_reports(review_id,product_id,review_author_id,reporter_user_id,reason,details,review_title_snapshot,review_body_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8)",[review.id,review.product_id,review.user_id,req.user.id,reason,details||null,review.title,review.body]);res.status(201).json({message:"Report submitted. Our team will review it against the community guidelines."});}catch(e){if(e.code==="23505")return res.status(409).json({error:"You have already reported this review."});throw e}}));
app.get("/api/admin/review-reports",auth,adminOnly,asyncRoute(async(req,res)=>{const r=await pool.query("select rr.id,rr.review_id,rr.product_id,rr.reason,rr.details,rr.review_title_snapshot,rr.review_body_snapshot,rr.status,rr.created_at,reporter.name as reporter_name,author.name as author_name,p.name as product_name from public.product_review_reports rr left join public.users reporter on reporter.id=rr.reporter_user_id left join public.users author on author.id=rr.review_author_id left join public.products p on p.id=rr.product_id order by case rr.status when 'pending' then 0 when 'under_review' then 1 else 2 end,rr.created_at desc limit 100");res.json({reports:r.rows});}));
app.patch("/api/admin/review-reports/:id",auth,adminOnly,asyncRoute(async(req,res)=>{const id=Number(req.params.id),status=String(req.body?.status||"");if(!Number.isSafeInteger(id)||id<1||!["under_review","actioned","dismissed"].includes(status))return res.status(400).json({error:"Choose a valid moderation status."});const r=await pool.query("update public.product_review_reports set status=$1,updated_at=now() where id=$2 returning id,status",[status,id]);if(!r.rowCount)return res.status(404).json({error:"Report not found."});res.json({report:r.rows[0],message:"Report status updated."});}));

const listProducts=async()=>{const r=await pool.query("select id,name,description,price,image,images,slug,sku,category,audience,stock,status,featured,created_at from public.products order by created_at desc,id desc");return r.rows.map(cleanProduct);};
app.get(["/api/admin/products","/api/seller/products"],auth,adminOnly,asyncRoute(async(req,res)=>res.json(await listProducts())));
app.post(["/api/admin/products","/api/seller/products"],auth,adminOnly,asyncRoute(async(req,res)=>{
  const {name,description,price,image,images,stock=0,category="Essentials",audience="Unisex",sku=null,featured=false,status="active"}=req.body||{},p=Number(price),q=Number(stock),gallery=Array.isArray(images)?images:(image?[image]:[]),primary=gallery[0]||image;
  if(!validText(name,120)||!validText(description,2000)||!Number.isFinite(p)||p<0||!validText(primary,2000)||!gallery.length||gallery.length>8||gallery.some(u=>!validText(u,2000)||!/^https:\/\//i.test(u))||!Number.isInteger(q)||q<0||!validText(category,60)||!["Men","Women","Unisex"].includes(audience)||!["draft","active","archived"].includes(status))return res.status(400).json({error:"Check product details, photos, price, category, audience and stock."});
  const slug=name.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+crypto.randomBytes(3).toString("hex");
  const r=await pool.query("insert into public.products(name,description,price,image,images,slug,sku,category,audience,stock,status,featured) values($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) returning *",[name.trim(),description.trim(),p,primary,JSON.stringify(gallery),slug,sku,category.trim(),audience,q,status,Boolean(featured)]);
  res.status(201).json({product:cleanProduct(r.rows[0]),message:"Product added to STND."});
}));
app.patch(["/api/admin/products/:id","/api/seller/products/:id"],auth,adminOnly,asyncRoute(async(req,res)=>{
  const id=Number(req.params.id),patch=req.body||{},allowed=["name","description","price","image","images","stock","category","audience","featured","status","sku"];
  if(!Number.isSafeInteger(id)||!Object.keys(patch).length||Object.keys(patch).some(k=>!allowed.includes(k)))return res.status(400).json({error:"Invalid product update."});
  const found=await pool.query("select * from public.products where id=$1",[id]);if(!found.rowCount)return res.status(404).json({error:"Product not found."});
  const n={...found.rows[0],...patch},gallery=Array.isArray(n.images)?n.images:(n.image?[n.image]:[]),primary=gallery[0]||n.image;
  if(!validText(n.name,120)||!validText(n.description,2000)||!Number.isFinite(Number(n.price))||Number(n.price)<0||!validText(primary,2000)||!gallery.length||gallery.length>8||gallery.some(u=>!validText(u,2000)||!/^https:\/\//i.test(u))||!Number.isInteger(Number(n.stock))||Number(n.stock)<0||!validText(n.category,60)||!["Men","Women","Unisex"].includes(n.audience)||!["draft","active","archived"].includes(n.status))return res.status(400).json({error:"Invalid product details."});
  const r=await pool.query("update public.products set name=$1,description=$2,price=$3,image=$4,images=$5::jsonb,stock=$6,category=$7,audience=$8,featured=$9,status=$10,sku=$11,updated_at=now() where id=$12 returning *",[n.name.trim(),n.description.trim(),Number(n.price),primary,JSON.stringify(gallery),Number(n.stock),n.category.trim(),n.audience,Boolean(n.featured),n.status,n.sku||null,id]);res.json({product:cleanProduct(r.rows[0]),message:"Product updated."});
}));
app.delete(["/api/admin/products/:id","/api/seller/products/:id"],auth,adminOnly,asyncRoute(async(req,res)=>{const r=await pool.query("update public.products set status='archived',stock=0,updated_at=now() where id=$1 and status<>'archived' returning id",[Number(req.params.id)]);if(!r.rowCount)return res.status(404).json({error:"Product not found."});res.json({message:"Product archived."});}));
app.get(["/api/admin/orders","/api/seller/orders"],auth,adminOnly,asyncRoute(async(req,res)=>{const r=await pool.query("select o.id,o.status,o.payment_status,o.total,o.created_at,c.name customer_name,c.email customer_email,oi.product_id,oi.quantity,oi.unit_price,coalesce(oi.product_name,p.name) product_name from public.orders o join public.customers c on c.id=o.customer_id join public.order_items oi on oi.order_id=o.id left join public.products p on p.id=oi.product_id order by o.created_at desc,o.id desc");res.json(r.rows.map(x=>({...x,id:Number(x.id),product_id:Number(x.product_id),quantity:Number(x.quantity),total:Number(x.total),unit_price:Number(x.unit_price)})));}));

app.post("/api/checkout",asyncRoute(async(req,res)=>{
  const {customer={},items,accountMode="guest",password,paymentMethod="card",paymentOutcome="success"}=req.body||{},name=String(customer.name||"").trim(),email=String(customer.email||"").trim().toLowerCase(),phone=String(customer.phone||"").trim(),address=String(customer.address||"").trim();
  if(!validText(name,100)||!validEmail(email)||!validText(address,500)||!Array.isArray(items)||!items.length||items.length>50)return res.status(400).json({error:"Enter your name, email, delivery address and add items to your bag."});
  if(!["card","ecocash","onemoney","pesepay"].includes(paymentMethod))return res.status(400).json({error:"Choose a valid payment method."});
  if(!["success","failed"].includes(paymentOutcome))return res.status(400).json({error:"Choose a valid payment response."});
  if(paymentMethod==="pesepay"&&!payReady())return res.status(503).json({error:"Pesepay is not configured. Choose card, EcoCash or OneMoney."});
  if(!["guest","signup","login"].includes(accountMode))return res.status(400).json({error:"Choose guest checkout, sign up or sign in."});
  if(accountMode!=="guest"&&(typeof password!=="string"||password.length<8||password.length>200))return res.status(400).json({error:"Enter your password (at least 8 characters)."});
  const c=await pool.connect();let orderId=null,sessionToken=null,guestToken=null,total=0;
  try{
    await c.query("begin");let user=readCookie(req,COOKIE)?await getSession(readCookie(req,COOKIE),c):null;
    if(accountMode==="signup"){if(ADMIN_EMAIL&&email===ADMIN_EMAIL)throw Object.assign(Error("The store administrator must use verified Google sign-in."),{status:403});if(user)throw Object.assign(Error("You are already signed in."),{status:400});const r=await c.query("insert into public.users(name,email,password_hash,role) values($1,$2,$3,'customer') returning id,name,email,role,created_at",[name,email,passwordHash(password)]);user=r.rows[0];sessionToken=await createSession(c,user.id);}
    if(accountMode==="login"){const r=await c.query("select id,name,email,password_hash,role,created_at from public.users where lower(email)=lower($1) limit 1 for update",[email]);const u=r.rows[0];if(!u||!passwordMatches(password,u.password_hash))throw Object.assign(Error("Email or password is incorrect."),{status:401});user=u;sessionToken=await createSession(c,u.id);}
    if(user&&String(user.email).toLowerCase()!==email)throw Object.assign(Error("Use the email address linked to your account."),{status:400});
    const quantities=new Map();for(const item of items){const id=Number(item.id),q=Number(item.quantity);if(!Number.isSafeInteger(id)||!Number.isInteger(q)||q<1||q>99)throw Object.assign(Error("Invalid item in your bag."),{status:400});quantities.set(id,(quantities.get(id)||0)+q);}
    const verified=[];for(const [id,q] of quantities){const r=await c.query("select id,name,price,stock,status from public.products where id=$1 for update",[id]);const p=r.rows[0];if(!p||p.status!=="active")throw Object.assign(Error("A product in your bag is no longer available."),{status:409});if(Number(p.stock)<q)throw Object.assign(Error("Not enough stock for "+p.name+". Available: "+p.stock+"."),{status:409});total+=Number(p.price)*q;verified.push({p,q});}
    const customerRow=await c.query("insert into public.customers(name,email,address,phone) values($1,$2,$3,$4) on conflict(email) do update set name=excluded.name,address=excluded.address,phone=excluded.phone returning id",[name,email,address,phone||null]);
    guestToken=user?null:crypto.randomBytes(32).toString("base64url");
    const order=await c.query("insert into public.orders(customer_id,user_id,total,status,payment_status,shipping_name,shipping_email,shipping_phone,shipping_address,guest_token_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",[customerRow.rows[0].id,user?user.id:null,total,"pending_payment","pending",name,email,phone||null,address,guestToken?hash(guestToken):null]);orderId=Number(order.rows[0].id);
    for(const x of verified){await c.query("insert into public.order_items(order_id,product_id,quantity,unit_price,product_name) values($1,$2,$3,$4,$5)",[orderId,x.p.id,x.q,x.p.price,x.p.name]);const dec=await c.query("update public.products set stock=stock-$1,updated_at=now() where id=$2 and stock >= $1",[x.q,x.p.id]);if(!dec.rowCount)throw Object.assign(Error("Stock changed while checking out. Please review your bag."),{status:409});}
    await c.query("commit");if(sessionToken)setCookie(res,sessionToken);
    if(paymentMethod==="pesepay"){try{const p=await startPayment(orderId,total);return res.status(201).json({message:"Continue to secure payment.",orderId,total,checkoutUrl:p.redirectUrl,accountCreated:accountMode==="signup"});}catch(e){await restoreOrder(orderId);throw Object.assign(Error("We couldn't start payment. No payment was taken and reserved stock has been released."),{status:502});}}
    const payment=await recordDemoPayment(orderId,"demo_"+paymentMethod,paymentOutcome);
    return res.status(201).json({message:payment.status==="paid"?"Payment confirmed. Your order is complete.":"Payment was unsuccessful. Your order was not confirmed.",orderId,total,checkoutUrl:null,paymentStatus:payment.status,paymentReference:payment.reference,paymentMethod,guestAccessToken:guestToken,accountCreated:accountMode==="signup"});
  }catch(e){try{await c.query("rollback");}catch{}if(e.code==="23505")return res.status(409).json({error:"An account with that email already exists. Choose sign in instead."});if(e.status)return res.status(e.status).json({error:e.message});throw e;}finally{c.release();}
}));

app.post("/payments/pesepay/result",asyncRoute(async(req,res)=>{if(!PAY_KEY||req.get("authorization")!==PAY_KEY)return res.sendStatus(401);const ref=req.body?.referenceNumber;if(typeof ref!=="string"||!ref)return res.sendStatus(400);res.sendStatus(200);try{const r=await pool.query("select payment_status from public.orders where payment_reference=$1",[ref]);if(r.rows[0]?.payment_status!=="paid")await settlePayment(await checkPayment(ref));}catch(e){console.error("[payments] callback verification failed:",e.code||e.message);}}));
app.get("/api/payments/status",asyncRoute(async(req,res)=>{const id=Number(req.query.orderId);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:"Missing order reference."});let r=await pool.query("select id,total,status,payment_status,payment_reference from public.orders where id=$1",[id]);const o=r.rows[0];if(!o)return res.status(404).json({error:"Order not found."});if(o.payment_status!=="paid"&&o.payment_reference){await settlePayment(await checkPayment(o.payment_reference));r=await pool.query("select status,payment_status,total from public.orders where id=$1",[id]);}res.json({orderId:id,status:r.rows[0].status,paymentStatus:r.rows[0].payment_status,total:Number(r.rows[0].total)});}));
app.get("/payment/return",(req,res)=>res.redirect("/?payment=return&order="+encodeURIComponent(String(req.query.order||""))));
app.get("/api/orders",auth,asyncRoute(async(req,res)=>{const r=await pool.query("select id,total,status,payment_status,created_at from public.orders where user_id=$1 order by created_at desc,id desc",[req.user.id]);res.json(r.rows.map(x=>({...x,id:Number(x.id),total:Number(x.total)})));}));
app.get("/api/orders/guest/:id",asyncRoute(async(req,res)=>{const token=String(req.query.token||"");if(!token)return res.status(400).json({error:"Guest order token required."});const r=await pool.query("select id,total,status,payment_status,created_at,shipping_name,shipping_email from public.orders where id=$1 and guest_token_hash=$2",[Number(req.params.id),hash(token)]);if(!r.rowCount)return res.status(404).json({error:"Order not found."});res.json({...r.rows[0],id:Number(r.rows[0].id),total:Number(r.rows[0].total)});}));

app.get("/sitemap.xml",(req,res)=>res.type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://stnd-store.onrender.com/</loc>\n  </url>\n</urlset>'));
app.get("/robots.txt",(req,res)=>res.type("text/plain").send('User-agent: *\nAllow: /\n\nDisallow: /api/\n\nSitemap: https://stnd-store.onrender.com/sitemap.xml\n'));
app.use(express.static(path.join(__dirname,"public"), { maxAge: "1h", etag: true }));
app.use("/api/*",(req,res)=>res.status(404).json({error:"API route not found."}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.use((err,req,res,next)=>{console.error("[api] request failed:",err.code||err.message);if(res.headersSent)return next(err);res.status(500).json({error:"Something went wrong. Please try again."});});
const cleanup=setInterval(()=>pool.query("delete from public.sessions where expires_at <= $1",[Date.now()]).catch(e=>console.error("[sessions] cleanup failed:",e.code||"unknown")),3600000);cleanup.unref();
async function start(){await pool.query("select 1");await pool.query("create table if not exists public.product_reviews(id bigserial primary key,product_id bigint not null references public.products(id) on delete cascade,user_id bigint not null references public.users(id) on delete cascade,rating smallint not null check(rating between 1 and 5),title varchar(100),body varchar(1500) not null,created_at timestamptz not null default now(),unique(product_id,user_id))");await pool.query("create index if not exists product_reviews_product_created_idx on public.product_reviews(product_id,created_at desc)");app.listen(PORT,"0.0.0.0",()=>console.log("STND. PostgreSQL storefront listening on "+PORT));}
start().catch(e=>{console.error("[startup] PostgreSQL connection failed:",e.code||e.message);process.exit(1);});
