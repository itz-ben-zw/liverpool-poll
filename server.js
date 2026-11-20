const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const path = require("node:path");

const app = express();
const db = new DatabaseSync(process.env.DB_PATH || "quickcart.db");
const PORT = Number(process.env.PORT || 3000);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || (process.env.NODE_ENV === "production" ? "https://quickcart-ecommerce-gu1i.onrender.com/auth/google/callback" : "http://localhost:3000/auth/google/callback");
const SESSION_DAYS = 7;
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  google_sub TEXT,
  role TEXT NOT NULL CHECK(role IN ('buyer','seller','admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL CHECK(price >= 0),
  image TEXT NOT NULL,
  seller_id INTEGER REFERENCES users(id),
  stock INTEGER NOT NULL DEFAULT 20 CHECK(stock >= 0),
  category TEXT NOT NULL DEFAULT 'Everyday',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  address TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  user_id INTEGER REFERENCES users(id),
  total REAL NOT NULL CHECK(total >= 0),
  status TEXT NOT NULL DEFAULT 'placed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
  unit_price REAL NOT NULL CHECK(unit_price >= 0)
);
`);

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare("PRAGMA table_info(" + table + ")").all();
  if (!columns.some(c => c.name === column)) db.exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
}
addColumnIfMissing("users", "google_sub", "TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub) WHERE google_sub IS NOT NULL;");
addColumnIfMissing("products", "seller_id", "INTEGER REFERENCES users(id)");
addColumnIfMissing("products", "stock", "INTEGER NOT NULL DEFAULT 20");
addColumnIfMissing("products", "category", "TEXT NOT NULL DEFAULT 'Everyday'");
addColumnIfMissing("products", "active", "INTEGER NOT NULL DEFAULT 1");
addColumnIfMissing("orders", "user_id", "INTEGER REFERENCES users(id)");
addColumnIfMissing("orders", "status", "TEXT NOT NULL DEFAULT 'placed'");
addColumnIfMissing("orders", "payment_reference", "TEXT");
addColumnIfMissing("orders", "payment_provider", "TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_reference_unique ON orders(payment_reference) WHERE payment_reference IS NOT NULL;");

const seed = [
 ["Essential Oversized Tee","A heavyweight cotton jersey tee with a relaxed, considered silhouette.",88,"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=900&q=85","Men",18],
 ["Relaxed Tailored Trousers","Clean lines and a relaxed drape, cut for everyday versatility.",148,"https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=900&q=85","Men",14],
 ["Structured Knit Polo","A refined knit polo with a soft hand-feel and understated finish.",125,"https://images.unsplash.com/photo-1627225924765-552d49cf47ad?w=900&q=85","Men",12],
 ["Leather Court Sneakers","Minimal low-top sneakers designed to work beyond one season.",165,"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=85","Footwear",10],
 ["Draped Midi Dress","An effortless silhouette with fluid movement and a clean neckline.",178,"https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=900&q=85","Women",9],
 ["Everyday Leather Tote","A structured carryall with room for the everyday essentials.",135,"https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=900&q=85","Accessories",11]
];
// Convert the original demo catalogue to the STND. launch collection without touching seller-owned listings.
const legacyFashion = [
 ["Wireless Headphones","Essential Oversized Tee","A heavyweight cotton jersey tee with a relaxed, considered silhouette.",88,"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=900&q=85","Men"],
 ["Classic Backpack","Relaxed Tailored Trousers","Clean lines and a relaxed drape, cut for everyday versatility.",148,"https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=900&q=85","Men"],
 ["Smart Watch","Structured Knit Polo","A refined knit polo with a soft hand-feel and understated finish.",125,"https://images.unsplash.com/photo-1627225924765-552d49cf47ad?w=900&q=85","Men"],
 ["Running Shoes","Leather Court Sneakers","Minimal low-top sneakers designed to work beyond one season.",165,"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=85","Footwear"],
 ["Desk Lamp","Draped Midi Dress","An effortless silhouette with fluid movement and a clean neckline.",178,"https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=900&q=85","Women"],
 ["Travel Bottle","Everyday Leather Tote","A structured carryall with room for the everyday essentials.",135,"https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=900&q=85","Accessories"]
];
const migrateLegacy = db.prepare("UPDATE products SET name=?,description=?,price=?,image=?,category=? WHERE name=? AND seller_id IS NULL");
for (const [oldName,name,description,price,image,category] of legacyFashion) migrateLegacy.run(name,description,price,image,category,oldName);

if (!db.prepare("SELECT COUNT(*) AS n FROM products").get().n) {
  const insert = db.prepare("INSERT INTO products(name,description,price,image,category,stock) VALUES(?,?,?,?,?,?)");
  seed.forEach(p => insert.run(...p));
}

const cleanUser = user => user ? ({ id:user.id, name:user.name, email:user.email, role:user.role, createdAt:user.created_at }) : null;
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");
function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + derived;
}
function passwordMatches(password, stored) {
  const [salt, expected] = String(stored).split(":");
  if (!salt || !expected) return false;
  const actual = Buffer.from(crypto.scryptSync(password, salt, 64).toString("hex"), "hex");
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}
function cookieOptions(maxAge) {
  return ["Path=/","HttpOnly","SameSite=Lax","Max-Age=" + maxAge, ...(process.env.NODE_ENV === "production" ? ["Secure"] : [])].join("; ");
}
function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0,idx).trim() === name) return decodeURIComponent(part.slice(idx+1).trim());
  }
  return null;
}
function auth(req,res,next) {
  const token = readCookie(req,"qc_session");
  if (!token) return res.status(401).json({error:"Please sign in to continue."});
  const session = db.prepare(`SELECT u.id,u.name,u.email,u.role,u.created_at
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(hashToken(token),Date.now());
  if (!session) {
    res.setHeader("Set-Cookie","qc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return res.status(401).json({error:"Your session has expired. Please sign in again."});
  }
  req.user=session; next();
}
const requireRole = role => (req,res,next) => req.user.role===role || req.user.role==="admin" ? next() : res.status(403).json({error:"This action is only available to " + role + " accounts."});
const validText = (v,max=500) => typeof v==="string" && v.trim().length>0 && v.trim().length<=max;
const emailOk = v => typeof v==="string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const publicProduct = p => ({...p, price:Number(p.price), stock:Number(p.stock), seller_id:p.seller_id===null?null:Number(p.seller_id), active:Boolean(p.active)});

app.get("/api/health",(req,res)=>res.json({status:"ok",database:"connected",timestamp:new Date().toISOString()}));

app.post("/api/auth/register",(req,res)=>{
  const {name,email,password,role="buyer"}=req.body||{};
  if(!validText(name,100)||!emailOk(email)||typeof password!=="string"||password.length<8||password.length>200||!["buyer","seller"].includes(role))
    return res.status(400).json({error:"Enter your name, a valid email, a password of at least 8 characters, and choose buyer or seller."});
  try{
    const result=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)").run(name.trim(),email.trim().toLowerCase(),passwordHash(password),role);
    const user=db.prepare("SELECT id,name,email,role,created_at FROM users WHERE id=?").get(result.lastInsertRowid);
    const token=crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,?)").run(user.id,hashToken(token),Date.now()+SESSION_DAYS*86400000);
    res.setHeader("Set-Cookie","qc_session="+encodeURIComponent(token)+"; "+cookieOptions(SESSION_DAYS*86400));
    res.status(201).json({user:cleanUser(user),message:"Account created. Welcome to QuickCart."});
  }catch(e){if(String(e.message).includes("UNIQUE"))return res.status(409).json({error:"An account with that email already exists."});res.status(500).json({error:"Could not create account."});}
});
app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body||{};
  if(!emailOk(email)||typeof password!=="string")return res.status(400).json({error:"Enter your email and password."});
  const user=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(email.trim());
  if(!user||!passwordMatches(password,user.password_hash))return res.status(401).json({error:"Email or password is incorrect."});
  const token=crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,?)").run(user.id,hashToken(token),Date.now()+SESSION_DAYS*86400000);
  res.setHeader("Set-Cookie","qc_session="+encodeURIComponent(token)+"; "+cookieOptions(SESSION_DAYS*86400));
  res.json({user:cleanUser(user),message:"Signed in successfully."});
});
function googleOAuthClient() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}
function safeEqual(a,b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length && crypto.timingSafeEqual(left,right);
}
function clearGoogleCookies(res) {
  const secure=process.env.NODE_ENV==="production" ? "; Secure" : "";
  ["qc_google_state","qc_google_nonce","qc_google_role"].forEach(name=>res.append("Set-Cookie",name+"=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"+secure));
}
app.get("/auth/google",(req,res)=>{
  const client=googleOAuthClient();
  if(!client)return res.redirect("/?google=setup#account");
  const role=req.query.role==="seller" ? "seller" : "buyer";
  const state=crypto.randomBytes(32).toString("base64url");
  const nonce=crypto.randomBytes(32).toString("base64url");
  const secure=process.env.NODE_ENV==="production" ? "; Secure" : "";
  res.append("Set-Cookie","qc_google_state="+state+"; Path=/; HttpOnly; SameSite=Lax; Max-Age=600"+secure);
  res.append("Set-Cookie","qc_google_nonce="+nonce+"; Path=/; HttpOnly; SameSite=Lax; Max-Age=600"+secure);
  res.append("Set-Cookie","qc_google_role="+role+"; Path=/; HttpOnly; SameSite=Lax; Max-Age=600"+secure);
  const url=client.generateAuthUrl({access_type:"online",prompt:"select_account",scope:["openid","email","profile"],state,nonce});
  res.redirect(url);
});
app.get("/auth/google/callback",async(req,res)=>{
  const client=googleOAuthClient();
  const stateCookie=readCookie(req,"qc_google_state");
  const nonceCookie=readCookie(req,"qc_google_nonce");
  const roleCookie=readCookie(req,"qc_google_role");
  const stateOk=safeEqual(String(req.query.state||""),stateCookie);
  clearGoogleCookies(res);
  if(!client || !stateOk || !nonceCookie || typeof req.query.code!=="string" || req.query.error) return res.redirect("/?google=failed#account");
  try{
    const {tokens}=await client.getToken(req.query.code);
    if(!tokens.id_token)throw Error("Google did not return an ID token.");
    const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:GOOGLE_CLIENT_ID});
    const profile=ticket.getPayload();
    if(!profile || !profile.sub || !profile.email || profile.email_verified!==true || !safeEqual(String(profile.nonce||""),nonceCookie)) throw Error("Google account verification failed.");
    let user=db.prepare("SELECT id,name,email,role,created_at,google_sub FROM users WHERE google_sub=?").get(profile.sub);
    if(!user){
      user=db.prepare("SELECT id,name,email,role,created_at,google_sub FROM users WHERE email=? COLLATE NOCASE").get(profile.email);
      if(user){
        if(user.google_sub && user.google_sub!==profile.sub)throw Error("That email is already linked to another Google account.");
        db.prepare("UPDATE users SET google_sub=? WHERE id=?").run(profile.sub,user.id);
        user=db.prepare("SELECT id,name,email,role,created_at,google_sub FROM users WHERE id=?").get(user.id);
      }else{
        const result=db.prepare("INSERT INTO users(name,email,password_hash,google_sub,role) VALUES(?,?,?,?,?)").run(String(profile.name||profile.email).slice(0,100),profile.email.toLowerCase(),"google:"+crypto.randomBytes(32).toString("hex"),profile.sub,roleCookie==="seller"?"seller":"buyer");
        user=db.prepare("SELECT id,name,email,role,created_at,google_sub FROM users WHERE id=?").get(result.lastInsertRowid);
      }
    }
    const token=crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,?)").run(user.id,hashToken(token),Date.now()+SESSION_DAYS*86400000);
    res.append("Set-Cookie","qc_session="+encodeURIComponent(token)+"; "+cookieOptions(SESSION_DAYS*86400));
    res.redirect("/?google=success");
  }catch(error){
    console.error("Google sign-in failed:",error.message);
    res.redirect("/?google=failed#account");
  }
});

app.post("/api/auth/logout",(req,res)=>{
  const token=readCookie(req,"qc_session"); if(token)db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
  res.setHeader("Set-Cookie","qc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");res.json({message:"Signed out."});
});
app.get("/api/auth/me",auth,(req,res)=>res.json({user:cleanUser(req.user)}));

app.get("/api/products",(req,res)=>{
  const rows=db.prepare("SELECT p.id,p.name,p.description,p.price,p.image,p.seller_id,p.stock,p.category,p.active,u.name AS seller_name FROM products p LEFT JOIN users u ON u.id=p.seller_id WHERE p.active=1 AND p.stock>0 ORDER BY p.id DESC").all();
  res.json(rows.map(publicProduct));
});
app.get("/api/seller/products",auth,requireRole("seller"),(req,res)=>{
  const rows=db.prepare("SELECT * FROM products WHERE seller_id=? ORDER BY created_at DESC,id DESC").all(req.user.id);
  res.json(rows.map(publicProduct));
});
app.post("/api/seller/products",auth,requireRole("seller"),(req,res)=>{
  const {name,description,price,image,stock=0,category="Everyday"}=req.body||{};
  const p=Number(price),q=Number(stock);
  if(!validText(name,120)||!validText(description,2000)||!Number.isFinite(p)||p<0||p>100000000||!validText(image,2000)||!Number.isInteger(q)||q<0||q>1000000||!validText(category,60))
    return res.status(400).json({error:"Check the product name, description, image URL, price, category and stock quantity."});
  const result=db.prepare("INSERT INTO products(name,description,price,image,seller_id,stock,category) VALUES(?,?,?,?,?,?,?)").run(name.trim(),description.trim(),p,image.trim(),req.user.id,q,category.trim());
  res.status(201).json({product:publicProduct(db.prepare("SELECT * FROM products WHERE id=?").get(result.lastInsertRowid)),message:"Product listed."});
});
app.patch("/api/seller/products/:id",auth,requireRole("seller"),(req,res)=>{
  const id=Number(req.params.id),existing=db.prepare("SELECT * FROM products WHERE id=? AND seller_id=?").get(id,req.user.id);
  if(!existing)return res.status(404).json({error:"Product not found in your shop."});
  const allowed=["name","description","price","image","stock","category"];
  const patch=req.body||{};if(!Object.keys(patch).length||Object.keys(patch).some(k=>!allowed.includes(k)))return res.status(400).json({error:"Only name, description, price, image, stock and category can be updated."});
  const next={...existing,...patch};
  if(!validText(next.name,120)||!validText(next.description,2000)||!Number.isFinite(Number(next.price))||Number(next.price)<0||!validText(next.image,2000)||!Number.isInteger(Number(next.stock))||Number(next.stock)<0||!validText(next.category,60))return res.status(400).json({error:"Invalid product details or stock quantity."});
  db.prepare("UPDATE products SET name=?,description=?,price=?,image=?,stock=?,category=? WHERE id=? AND seller_id=?").run(next.name.trim(),next.description.trim(),Number(next.price),next.image.trim(),Number(next.stock),next.category.trim(),id,req.user.id);
  res.json({product:publicProduct(db.prepare("SELECT * FROM products WHERE id=?").get(id)),message:"Product updated."});
});
app.delete("/api/seller/products/:id",auth,requireRole("seller"),(req,res)=>{
  const result=db.prepare("UPDATE products SET active=0 WHERE id=? AND seller_id=? AND active=1").run(Number(req.params.id),req.user.id);
  if(!result.changes)return res.status(404).json({error:"Product not found in your shop."});
  res.json({message:"Product removed from your storefront."});
});
app.get("/api/seller/orders",auth,requireRole("seller"),(req,res)=>{
  const rows=db.prepare(`SELECT o.id,o.status,o.total,o.created_at,c.name AS customer_name,c.email AS customer_email,
    oi.product_id,oi.quantity,oi.unit_price,p.name AS product_name
    FROM orders o JOIN customers c ON c.id=o.customer_id
    JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id
    WHERE p.seller_id=? ORDER BY o.created_at DESC,o.id DESC`).all(req.user.id);
  res.json(rows.map(r=>({...r,total:Number(r.total),unit_price:Number(r.unit_price)})));
});

app.post("/api/checkout",(req,res)=>{
  const {customer,items}=req.body||{};
  if(!customer?.name||!emailOk(customer.email)||!customer?.address||!Array.isArray(items)||!items.length)return res.status(400).json({error:"Complete your details and add items to your cart."});
  const token=readCookie(req,"qc_session");
  const user=token?db.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").get(hashToken(token),Date.now()):null;
  try{
    db.exec("BEGIN IMMEDIATE");let total=0;
    const rows=items.map(i=>{
      const id=Number(i.id),q=Number(i.quantity);
      if(!Number.isInteger(id)||!Number.isInteger(q)||q<1||q>99)throw Error("Invalid cart item.");
      const p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(id);
      if(!p)throw Error("A product in your cart is no longer available.");
      if(p.stock<q)throw Error("Not enough stock for "+p.name+". Available: "+p.stock+".");
      total+=p.price*q;return {p,q};
    });
    const email=customer.email.trim().toLowerCase();
    db.prepare("INSERT INTO customers(name,email,address) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,address=excluded.address").run(customer.name.trim(),email,customer.address.trim());
    const c=db.prepare("SELECT id FROM customers WHERE email=?").get(email);
    const o=db.prepare("INSERT INTO orders(customer_id,user_id,total) VALUES(?,?,?)").run(c.id,user?.id||null,total);
    const ins=db.prepare("INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES(?,?,?,?)");
    const dec=db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?");
    rows.forEach(x=>{ins.run(o.lastInsertRowid,x.p.id,x.q,x.p.price);const changed=dec.run(x.q,x.p.id,x.q);if(!changed.changes)throw Error("Stock changed while checking out. Please try again.");});
    db.exec("COMMIT");res.status(201).json({message:"Order placed successfully!",orderId:Number(o.lastInsertRowid),total});
  }catch(e){try{db.exec("ROLLBACK")}catch{}res.status(400).json({error:e.message});}
});
app.get("/api/orders",auth,(req,res)=>{
  const rows=db.prepare("SELECT id,total,status,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC,id DESC").all(req.user.id);
  res.json(rows.map(r=>({...r,total:Number(r.total)})));
});
app.use("/api/*",(req,res)=>res.status(404).json({error:"API route not found."}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Something went wrong. Please try again."});});
const cleanup=setInterval(()=>db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now()),3600000);
cleanup.unref();
app.listen(PORT,"0.0.0.0",()=>console.log("QuickCart API and storefront listening on "+PORT));
