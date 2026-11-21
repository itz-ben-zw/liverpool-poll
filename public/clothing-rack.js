(function(){
"use strict";
const byId=id=>document.getElementById(id);
const variantFor=(product,variantId)=>{for(const colour of product?.variants||[]){const found=(colour.sizes||[]).find(v=>Number(v.id)===Number(variantId));if(found)return found;}return null;};
const swatchColour=name=>({"Stone":"#bdb6a6","Olive":"#5f6b46","Navy":"#26344f","Rust":"#a9502e","Charcoal":"#3a3b3d","Sand":"#d8c9a6"}[name]||"#aaa");
const nativeOpen=window.openProductInfo;
if(typeof nativeOpen==="function")window.openProductInfo=function(id,trigger){
 nativeOpen(id,trigger);
 const product=products.find(p=>Number(p.id)===Number(id)),body=byId("productInfoBody");
 if(!product||!body)return;
 const colours=Array.isArray(product.variants)?product.variants:[];
 if(!colours.length){renderSingleProductRack(product,body);return;}
 const original=body.innerHTML;
 body.innerHTML='<div class="rack-experience"><div><div class="rack-stage" id="rackStage" aria-label="Clothing colour rack"><div class="rack-rail"></div><div class="rack-tick"></div><div class="rack-counter" id="rackCounter"></div></div><div class="rack-controls"><span class="rack-kicker">Drag · Swipe · Select a colour</span><div class="rack-arrows"><button type="button" id="rackPrev" aria-label="Previous colour">‹</button><button type="button" id="rackNext" aria-label="Next colour">›</button></div></div></div><aside class="rack-product-panel"><p class="rack-kicker">STND. / COLOUR SELECTION</p><h3>'+esc(product.name)+'</h3><p class="rack-colour-title" id="rackColourTitle"></p><p class="rack-price" id="rackPrice"></p><label class="rack-size-label" for="rackSize">Select size</label><select class="rack-size-select" id="rackSize"></select><p class="rack-stock" id="rackStock" aria-live="polite"></p><div class="rack-swatches" id="rackSwatches" aria-label="Available colours"></div><div class="rack-view-toggle"><button type="button" id="rackFront" aria-pressed="true">Front</button><button type="button" id="rackBack" aria-pressed="false">Back</button></div><button type="button" class="rack-add" id="rackAdd">Add selected size to bag</button></aside></div><div class="rack-detail-copy">'+original+'</div>';
 body.querySelector(".info-actions")?.remove();
 initRack(product,colours);
};
function renderSingleProductRack(product,body){
 const images=typeof productImages==="function"?productImages(product):[product.image,...(Array.isArray(product.images)?product.images:[])].filter((url,index,all)=>typeof url==="string"&&/^https?:\/\//i.test(url.trim())&&all.indexOf(url)===index);
 const image=images[0]||"";
 const original=body.innerHTML;
 const available=Math.max(0,Number(product.stock)||0);
 const wrap=document.createElement("div");wrap.className="rack-single-experience";
 const stage=document.createElement("div");stage.className="rack-single-stage";
 const rail=document.createElement("div");rail.className="rack-single-rail";stage.appendChild(rail);
 const garment=document.createElement("div");garment.className="rack-single-garment";
 garment.insertAdjacentHTML("beforeend",'<svg class="rack-single-hanger" viewBox="0 0 180 74" aria-hidden="true"><path d="M90 12c0-10 15-10 15 0 0 5-6 8-15 14L9 61M90 26l81 35" fill="none" stroke="#292927" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>');
 if(image){const img=document.createElement("img");let imageIndex=0;img.className="rack-single-image";img.src=image;img.alt=product.name;img.draggable=false;img.addEventListener("error",()=>{imageIndex++;if(images[imageIndex]){img.src=images[imageIndex];}else{img.remove();const missing=document.createElement("div");missing.className="rack-single-no-image";missing.textContent="Product image unavailable";garment.appendChild(missing);}});garment.appendChild(img);}
 else{const missing=document.createElement("div");missing.className="rack-single-no-image";missing.textContent="Product image unavailable";garment.appendChild(missing);}
 stage.appendChild(garment);
 const tag=document.createElement("span");tag.className="rack-single-label";tag.textContent="STND. / THE PIECE";stage.appendChild(tag);
 const panel=document.createElement("aside");panel.className="rack-single-panel";
 panel.innerHTML='<p class="rack-kicker">STND. / PRODUCT VIEW</p><h3></h3><p class="rack-single-category"></p><p class="rack-price"></p><p class="rack-stock"></p><p class="rack-single-description"></p><button type="button" class="rack-add" id="rackSingleAdd">Add to bag</button><p class="rack-single-note">Single product view · No unconfigured colours or sizes shown</p>';
 panel.querySelector("h3").textContent=product.name;
 panel.querySelector(".rack-single-category").textContent=product.category||"Collection";
 panel.querySelector(".rack-price").textContent="$"+money(product.price);
 panel.querySelector(".rack-stock").textContent=available>0?available+" available":"Currently out of stock";
 panel.querySelector(".rack-single-description").textContent=product.description||"";
 const add=panel.querySelector("#rackSingleAdd");add.disabled=available<1;
 wrap.append(stage,panel);
 const details=document.createElement("div");details.className="rack-detail-copy";details.innerHTML=original;
 body.replaceChildren(wrap,details);
 body.querySelector(".info-actions")?.remove();
 add.addEventListener("click",()=>{
  if(available<1)return;
  const existing=cart.find(x=>Number(x.id)===Number(product.id)&&!x.variantId);
  if(existing){if(existing.quantity>=available){byId("message").textContent="You've reached the available stock.";return;}existing.quantity++;}
  else cart.push({id:Number(product.id),quantity:1});
  renderCart();byId("message").textContent="Added "+product.name+" to your bag.";
 });
}
function initRack(product,colours){
 const stage=byId("rackStage"),sizeSelect=byId("rackSize"),add=byId("rackAdd");
 if(!stage)return;
 const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 let active=0,position=0,front=true,selectedSize=null,drag=null,raf=0;
 const garments=[];
 colours.forEach((colour,index)=>{
  const button=document.createElement("button");button.type="button";button.className="rack-garment";button.dataset.index=index;button.setAttribute("aria-label","Select "+colour.name);
  const hanger='<svg class="rack-hanger" viewBox="0 0 180 74" aria-hidden="true"><path d="M90 12c0-10 15-10 15 0 0 5-6 8-15 14L9 61M90 26l81 35" fill="none" stroke="#292927" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const image=colour.frontImage?'<img src="'+esc(colour.frontImage)+'" alt="'+esc(product.name)+' in '+esc(colour.name)+'" draggable="false">':'<div class="rack-placeholder"><i style="background:'+swatchColour(colour.name)+'"></i><span>Front image needed</span></div>';
  button.innerHTML=hanger+image;const garmentImage=button.querySelector("img");if(garmentImage)garmentImage.addEventListener("error",()=>{garmentImage.remove();const fallback=document.createElement("div");fallback.className="rack-placeholder";const swatch=document.createElement("i");swatch.style.background=swatchColour(colour.name);const label=document.createElement("span");label.textContent="Image unavailable";fallback.append(swatch,label);button.appendChild(fallback);},{once:true});stage.appendChild(button);garments.push(button);
  button.addEventListener("click",()=>{if(stage._dragged){stage._dragged=false;return;}go(index);});
 });
 function render(){
  const spacing=Math.max(76,Math.min(130,stage.clientWidth*.24));
  garments.forEach((el,i)=>{const d=i-position,a=Math.abs(d),x=d*spacing,scale=1-Math.min(a,2.4)*.15,depth=-Math.min(a,3)*45,rot=Math.max(-48,Math.min(48,d*-17));el.style.transform="translateX("+x+"px) translateZ("+depth+"px) rotateY("+rot+"deg) scale("+scale+")";el.style.opacity=String(Math.max(.12,1-Math.max(0,a-1.25)*.55));el.style.zIndex=String(100-Math.round(a*10));el.classList.toggle("is-active",i===active);});
  byId("rackCounter").textContent=String(active+1).padStart(2,"0")+" / "+String(colours.length).padStart(2,"0");
  byId("rackPrev").disabled=active===0;byId("rackNext").disabled=active===colours.length-1;
 }
 function setFrontBack(){
  const colour=colours[active],image=garments[active]?.querySelector("img"),url=front?(colour.frontImage||colour.sizes.find(v=>v.frontImage)?.frontImage):(colour.backImage||colour.sizes.find(v=>v.backImage)?.backImage);
  byId("rackFront").setAttribute("aria-pressed",String(front));byId("rackBack").setAttribute("aria-pressed",String(!front));byId("rackBack").disabled=!(colour.backImage||colour.sizes.some(v=>v.backImage));
  if(image&&url&&image.src!==url){if(!reduced)image.classList.add("is-turning");setTimeout(()=>{image.src=url;image.alt=product.name+" in "+colour.name+" "+(front?"front":"back")+" view";image.classList.remove("is-turning");},reduced?0:250);}
 }
 function updatePanel(){
  const colour=colours[active];byId("rackColourTitle").textContent="in "+colour.name;byId("rackPrice").textContent="$"+(Number(product.price)+Number((colour.sizes[0]||{}).priceAdjustment||0)).toFixed(2);
  byId("rackSwatches").innerHTML=colours.map((c,i)=>'<button type="button" class="rack-swatch" data-swatch="'+i+'" title="'+esc(c.name)+'" aria-label="'+esc(c.name)+'" aria-pressed="'+(i===active)+'" style="background:'+swatchColour(c.name)+'"></button>').join("");
  const sizes=colour.sizes||[];sizeSelect.innerHTML=sizes.map(v=>'<option value="'+v.id+'" '+(Number(v.stock)<=0?"disabled":"")+'>'+esc(v.size)+' · '+(Number(v.stock)>0?Number(v.stock)+" available":"Sold out")+'</option>').join("");
  selectedSize=sizes.find(v=>Number(v.stock)>0)||sizes[0]||null;if(selectedSize)sizeSelect.value=selectedSize.id;
  syncStock();front=true;setFrontBack();render();
 }
 function syncStock(){
  selectedSize=(colours[active].sizes||[]).find(v=>Number(v.id)===Number(sizeSelect.value))||selectedSize;
  const stock=Number(selectedSize?.stock||0);byId("rackPrice").textContent="$"+(Number(product.price)+Number(selectedSize?.priceAdjustment||0)).toFixed(2);byId("rackStock").textContent=stock>0?(stock<=3?"Only "+stock+" left":"In stock · "+stock+" available"):"This size is sold out";
  add.disabled=!selectedSize||stock<1;add.textContent=stock>0?"Add "+colours[active].name+" / "+selectedSize.size+" to bag":"Sold out";
 }
 function go(index){active=Math.max(0,Math.min(colours.length-1,index));const start=position;const end=active;if(reduced){position=end;updatePanel();return;}const began=performance.now(),duration=560;function animate(now){const t=Math.min(1,(now-began)/duration),ease=1-Math.pow(1-t,4);position=start+(end-start)*ease;render();if(t<1)raf=requestAnimationFrame(animate);else{position=end;updatePanel();}}cancelAnimationFrame(raf);raf=requestAnimationFrame(animate);}
 byId("rackPrev").onclick=()=>go(active-1);byId("rackNext").onclick=()=>go(active+1);
 byId("rackSwatches").addEventListener("click",e=>{const b=e.target.closest("[data-swatch]");if(b)go(Number(b.dataset.swatch));});
 sizeSelect.addEventListener("change",syncStock);
 byId("rackFront").onclick=()=>{front=true;setFrontBack();};byId("rackBack").onclick=()=>{front=false;setFrontBack();};
 add.onclick=()=>{if(!selectedSize||Number(selectedSize.stock)<1)return;const variantId=Number(selectedSize.id),existing=cart.find(x=>Number(x.id)===Number(product.id)&&Number(x.variantId)===variantId);if(existing){if(existing.quantity>=Number(selectedSize.stock)){byId("rackStock").textContent="You've reached the available stock.";return;}existing.quantity++;}else cart.push({id:Number(product.id),variantId,variantLabel:colours[active].name+" / "+selectedSize.size,variantStock:Number(selectedSize.stock),priceAdjustment:Number(selectedSize.priceAdjustment||0),quantity:1});renderCart();byId("message").textContent="Added "+colours[active].name+" / "+selectedSize.size+" to your bag.";};
 stage.addEventListener("pointerdown",e=>{drag={x:e.clientX,start:position,moved:false};stage.classList.add("is-dragging");});
 window.addEventListener("pointermove",e=>{if(!drag)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>7)drag.moved=true;if(drag.moved){position=Math.max(-.2,Math.min(colours.length-.8,drag.start-dx/Math.max(76,Math.min(130,stage.clientWidth*.24))));render();}});
 window.addEventListener("pointerup",()=>{if(!drag)return;const moved=drag.moved;stage.classList.remove("is-dragging");stage._dragged=moved;if(moved){go(Math.round(position));setTimeout(()=>{stage._dragged=false;},0);}drag=null;});
 stage.addEventListener("pointercancel",()=>{drag=null;stage.classList.remove("is-dragging");});
 stage.addEventListener("wheel",e=>{const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(Math.abs(delta)>8){e.preventDefault();go(active+(delta>0?1:-1));}},{passive:false});
 render();updatePanel();
}
function rackRenderCart(){
 const count=cart.reduce((s,i)=>s+i.quantity,0);byId("count").textContent=count;
 byId("items").innerHTML=cart.length?cart.map((item,index)=>{const p=products.find(x=>Number(x.id)===Number(item.id));if(!p)return "";const variant=variantFor(p,item.variantId),label=item.variantLabel||(variant?.colour&&variant?.size?variant.colour+" / "+variant.size:""),price=Number(p.price)+Number(item.priceAdjustment||variant?.priceAdjustment||0);return '<div class="cart-row"><span>'+esc(p.name)+(label?'<small class="cart-variant-label">'+esc(label)+'</small>':'')+'<div class="cart-qty"><button data-rack-cart-qty="-1" data-index="'+index+'" aria-label="Decrease quantity">−</button><b>'+item.quantity+'</b><button data-rack-cart-qty="1" data-index="'+index+'" aria-label="Increase quantity">+</button></div></span><span>$'+(price*item.quantity).toFixed(2)+' <button data-rack-cart-remove="'+index+'">Remove</button></span></div>';}).join(""):"Your bag is empty.";
 byId("total").textContent=cart.reduce((sum,item)=>{const p=products.find(x=>Number(x.id)===Number(item.id));return sum+(p?(Number(p.price)+Number(item.priceAdjustment||0))*item.quantity:0);},0).toFixed(2);
}
window.renderCart=rackRenderCart;
document.addEventListener("click",e=>{
 const qty=e.target.closest("[data-rack-cart-qty]");if(qty){const index=Number(qty.dataset.index),item=cart[index],p=item&&products.find(x=>Number(x.id)===Number(item.id));if(!item||!p)return;const variant=variantFor(p,item.variantId),stock=Number(variant?.stock??item.variantStock??p.stock);item.quantity=Math.max(0,Math.min(stock,item.quantity+Number(qty.dataset.rackCartQty)));if(!item.quantity)cart.splice(index,1);rackRenderCart();}
 const remove=e.target.closest("[data-rack-cart-remove]");if(remove){cart.splice(Number(remove.dataset.rackCartRemove),1);rackRenderCart();}
});
rackRenderCart();
})();