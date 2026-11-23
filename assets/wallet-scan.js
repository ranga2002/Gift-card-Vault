/* F05 privacy-first image intake, OCR and review-to-draft. No image uploads or persistence. */
(function(){
"use strict";
const api=window.GiftVaultScanExtract;
if(!api){console.error("F05 parser unavailable");return;}
const get=id=>document.getElementById(id);
const validTypes=new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);
const MAX_SIZE=8*1024*1024,MAX_PIXELS=24*1000*1000;
let root=null,handler=null,file=null,url=null,busy=false,serial=0,result=null,focusBefore=null;
let externalScript=null;
function build(){
  if(root)return;
  root=document.createElement("section");
  root.id="gv-scan-panel";root.className="gv-scan-overlay";root.hidden=true;
  root.innerHTML="<div class=\"gv-scan-dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"gv-scan-title\">\n<header class=\"gv-scan-heading\"><div><small>GIFT VAULT · PRIVACY-FIRST</small><h2 id=\"gv-scan-title\">Scan a card or receipt</h2><p>Review every suggestion before filling a new card draft.</p></div><button type=\"button\" id=\"gv-scan-close\" class=\"gv-scan-secondary\">Close</button></header>\n<div class=\"gv-scan-body\">\n<section class=\"gv-scan-upload\"><label for=\"gv-scan-file\">Choose or photograph a card / receipt</label><input id=\"gv-scan-file\" type=\"file\" accept=\"image/jpeg,image/png,image/webp,image/heic,image/heif\" capture=\"environment\"><small>JPG, PNG, WebP, HEIC where supported · 8 MB max · no app upload</small><div id=\"gv-scan-preview-wrap\" hidden><img id=\"gv-scan-preview\" alt=\"Selected card or receipt\" /></div></section>\n<section class=\"gv-scan-ocr\"><div class=\"gv-scan-controls\"><button id=\"gv-scan-native\" type=\"button\">Read text on device</button><button id=\"gv-scan-enhanced\" type=\"button\" class=\"gv-scan-secondary\">Enhanced OCR (optional)</button><button id=\"gv-scan-example\" type=\"button\" class=\"gv-scan-secondary\" hidden>Try fictional example</button></div>\n<label class=\"gv-scan-privacy-consent\" for=\"gv-scan-optin\"><input id=\"gv-scan-optin\" type=\"checkbox\"><span>Enhanced OCR downloads third-party OCR code and language data from a CDN. It processes images in-browser, but requires trusting that downloaded code with this image.</span></label>\n<p class=\"gv-scan-hint\">Built-in OCR is not supported by all browsers. Enhanced OCR uses third-party code after explicit consent. Do not scan sensitive codes with it unless you trust the provider. Manual entry is always available.</p>\n<label for=\"gv-scan-raw\">Recognized text (optional — paste text or correct OCR mistakes)</label><textarea id=\"gv-scan-raw\" rows=\"4\" maxlength=\"12000\" placeholder=\"STORE: Demo Store&#10;GIFT CARD BALANCE: CAD 50.00&#10;VALID UNTIL: 30 Nov 2027\"></textarea><button type=\"button\" id=\"gv-scan-parse\" class=\"gv-scan-secondary\">Find details in text</button></section>\n<p id=\"gv-scan-status\" role=\"status\" aria-live=\"polite\">Select a photo or enter details manually.</p>\n<section class=\"gv-scan-review\"><h3>Review before transferring</h3><p>All suggested values may be wrong. Verify the actual issuer, remaining balance, denomination and expiration.</p><div class=\"gv-scan-grid\">\n<label for=\"gv-scan-store\">Merchant / brand <small id=\"gv-scan-store-confidence\"></small><input id=\"gv-scan-store\" type=\"text\" maxlength=\"100\" autocomplete=\"off\" placeholder=\"Confirm issuer or store\"></label>\n<label for=\"gv-scan-currency\">Card denomination <small id=\"gv-scan-currency-confidence\"></small><select id=\"gv-scan-currency\"><option value=\"\">Select currency</option><option value=\"INR\">INR (₹)</option><option value=\"CAD\">CAD (CA$)</option><option value=\"USD\">USD (US$)</option></select></label>\n<label for=\"gv-scan-amount\">Remaining card balance <small id=\"gv-scan-amount-confidence\"></small><input id=\"gv-scan-amount\" type=\"number\" min=\"0\" step=\"0.01\" inputmode=\"decimal\" placeholder=\"Not necessarily receipt total\"></label>\n<label for=\"gv-scan-expiry\">Expiry date <small id=\"gv-scan-expiry-confidence\"></small><input id=\"gv-scan-expiry\" type=\"date\"></label></div>\n<div class=\"gv-scan-code\"><p>Possible gift card number: <strong id=\"gv-scan-masked\">Not found</strong></p><label><input type=\"checkbox\" id=\"gv-scan-code-consent\" disabled> Include detected number in the private code field</label><small>A PIN is never copied automatically; confirm it manually using your card's issuer instructions.</small></div><div id=\"gv-scan-warnings\" aria-live=\"polite\"></div></section>\n</div><footer class=\"gv-scan-footer\"><button id=\"gv-scan-apply\" type=\"button\">Apply to new card draft</button><button id=\"gv-scan-cancel\" type=\"button\" class=\"gv-scan-secondary\">Discard and close</button><small>Only copies the reviewed fields. Save to Vault is a separate action.</small></footer></div>";
  document.body.append(root);
  get("gv-scan-close").addEventListener("click",close);
  get("gv-scan-cancel").addEventListener("click",close);
  get("gv-scan-file").addEventListener("change",selectFile);
  get("gv-scan-native").addEventListener("click",nativeOCR);
  get("gv-scan-enhanced").addEventListener("click",enhancedOCR);
  get("gv-scan-parse").addEventListener("click",parseText);
  get("gv-scan-example").addEventListener("click",example);
  get("gv-scan-apply").addEventListener("click",apply);
  root.addEventListener("click",e=>{if(e.target===root)close();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&root&&!root.hidden&&!busy){e.preventDefault();close();}});
}
function status(text,kind="info"){const el=get("gv-scan-status");if(el){el.textContent=String(text);el.dataset.kind=kind;}}
function setBusy(value){
  busy=value;
  if(!root)return;
  root.querySelectorAll("button,input[type=file]").forEach(el=>{
    // Close/Discard remain available while expensive OCR runs. Closing
    // invalidates the in-flight result before its asynchronous continuation.
    if(el.id==="gv-scan-close"||el.id==="gv-scan-cancel")return;
    el.disabled=value;
  });
}
function clearImage(){
  if(url){URL.revokeObjectURL(url);url=null;}
  file=null;
  if(root){get("gv-scan-preview").removeAttribute("src");get("gv-scan-preview-wrap").hidden=true;get("gv-scan-file").value="";}
}
function clearData(){
  serial++;clearImage();result=null;
  if(!root)return;
  for(const k of ["raw","store","currency","amount","expiry"])get("gv-scan-"+k).value="";
  for(const k of ["store","currency","amount","expiry"])get("gv-scan-"+k+"-confidence").textContent="";
  get("gv-scan-optin").checked=false;
  get("gv-scan-code-consent").checked=false;get("gv-scan-code-consent").disabled=true;
  get("gv-scan-masked").textContent="Not found";get("gv-scan-warnings").replaceChildren();
}
function open(config={}){
  build();if(busy)return;
  clearData();handler=typeof config.onApply==="function"?config.onApply:null;
  get("gv-scan-example").hidden=!config.preview;
  focusBefore=document.activeElement;
  root.hidden=false;status("Image is never uploaded by Gift Vault. You can also enter fields manually.");
  get("gv-scan-file").focus();
}
function close(){
  if(!root||root.hidden)return;
  root.hidden=true;clearData();handler=null;
  // An OCR worker may still terminate asynchronously, but its ticket has
  // been invalidated and cannot repopulate a new or signed-out session.
  setBusy(false);
  if(focusBefore?.isConnected&&typeof focusBefore.focus==="function")focusBefore.focus();
  focusBefore=null;
}
async function selectFile(event){
  // Capture the selected file BEFORE clearing the old input. Resetting a
  // file input also clears its FileList, which otherwise silently drops the
  // user's freshly selected photo.
  const f=event.target.files&&event.target.files[0];
  const ticket=++serial;
  clearImage();
  if(!f)return;
  if(!validTypes.has(f.type)){status("Use a JPG, PNG, WebP or supported HEIC/HEIF file. SVG and PDF are not supported.","error");return;}
  if(f.size<1||f.size>MAX_SIZE){status("Choose an image no larger than 8 MB.","error");return;}
  file=f;url=URL.createObjectURL(f);
  const img=get("gv-scan-preview");img.src=url;
  try{
    await img.decode();
    // A discarded, replaced, or signed-out image must never reopen a stale
    // preview or overwrite the status of another file.
    if(ticket!==serial||file!==f||!root||root.hidden)return;
    if(img.naturalWidth*img.naturalHeight>MAX_PIXELS)throw new Error("Image too large");
    get("gv-scan-preview-wrap").hidden=false;
    status("Image loaded locally. Run OCR or enter details manually.");
  }catch{
    if(ticket!==serial||file!==f||!root||root.hidden)return;
    clearImage();status("The image could not be decoded or is too large. Try a smaller JPG or PNG.","error");
  }
}
function display(p){
  result=p;
  for(const [id,key] of [["store","merchant"],["amount","amount"],["currency","currency"],["expiry","expiry"]]){
    const suggestion=p[key];
    get("gv-scan-"+id).value=suggestion?.value??"";
    get("gv-scan-"+id+"-confidence").textContent=suggestion?
      suggestion.confidence>=0.8?"Suggestion · verify":"Uncertain · verify manually":"Not found";
  }
  get("gv-scan-masked").textContent=p.code?api.maskCode(p.code.value):"Not found";
  get("gv-scan-code-consent").checked=false;
  get("gv-scan-code-consent").disabled=!p.code;
  const warnings=get("gv-scan-warnings");warnings.replaceChildren();
  for(const message of p.warnings){const line=document.createElement("p");line.textContent=message;warnings.append(line);}
  status("Candidate details found. Check and edit every field before applying.","success");
}
function parseText(){display(api.extract(get("gv-scan-raw").value));}
async function nativeOCR(){
  if(busy)return;
  const ticket=++serial;let bitmap=null;setBusy(true);
  try{
    if(!file)throw Error("Choose an image first.");
    if(typeof window.TextDetector!=="function")throw Error("Built-in on-device OCR is unavailable in this browser. Try Enhanced OCR with consent, paste recognized text, or enter details manually.");
    status("Reading text on device…");
    bitmap=await createImageBitmap(file);
    const items=await new window.TextDetector().detect(bitmap);
    if(ticket!==serial)return;
    const detected=items.map(i=>String(i.rawValue||"")).filter(Boolean).join("\n");
    if(!detected.trim())throw Error("No readable text found. Try a clearer photo or enter values manually.");
    get("gv-scan-raw").value=detected.slice(0,api.MAX_TEXT);
    parseText();
  }catch(err){if(ticket===serial)status(err.message||"Could not read this image.","error");}
  finally{if(bitmap?.close)bitmap.close();if(ticket===serial)setBusy(false);}
}
function loadEnhancedOCR(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
  if(externalScript)return externalScript;
  externalScript=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/6.0.1/tesseract.min.js";
    script.crossOrigin="anonymous";script.async=true;
    script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(Error("Third-party OCR code did not initialize."));
    script.onerror=()=>reject(Error("Third-party OCR code could not be downloaded."));
    document.head.append(script);
  }).catch(err=>{externalScript=null;throw err;});
  return externalScript;
}
async function enhancedOCR(){
  if(busy)return;
  if(!get("gv-scan-optin").checked){status("Explicitly agree to the optional third-party OCR download first.","error");return;}
  if(!file){status("Choose an image first.","error");return;}
  const ticket=++serial;let worker=null;setBusy(true);
  try{
    status("Downloading optional OCR engine and language data. Recognition runs in the browser…");
    const tesseract=await loadEnhancedOCR();
    worker=await tesseract.createWorker("eng",1,{logger:m=>{
      if(ticket===serial&&m.status==="recognizing text")status("Reading the image: "+Math.round(100*(m.progress||0))+"%");
    }});
    if(ticket!==serial)return; // user cancelled while the worker downloaded
    const out=await worker.recognize(file);
    if(ticket!==serial)return;
    const text=String(out?.data?.text||"").slice(0,api.MAX_TEXT);
    if(!text.trim())throw Error("No text found in the photo.");
    get("gv-scan-raw").value=text;parseText();
  }catch(err){if(ticket===serial)status("Enhanced OCR unavailable: "+(err.message||"unknown error")+". You can enter details manually.","error");}
  finally{if(worker)try{await worker.terminate();}catch{}if(ticket===serial)setBusy(false);}
}
function example(){
  get("gv-scan-raw").value="STORE: Fictional Demo Market\nGIFT CARD BALANCE: CAD 75.00\nVALID UNTIL: 30 Nov 2027\nGIFT CARD NUMBER: DEMO-1234-5678\nPIN: 9999";
  parseText();
}
function apply(){
  if(busy||typeof handler!=="function")return;
  const store=get("gv-scan-store").value.trim(),currency=get("gv-scan-currency").value;
  const numText=get("gv-scan-amount").value.trim(),amount=numText===""?null:Number(numText);
  const expiry=get("gv-scan-expiry").value;
  if(!store&&!currency&&amount===null&&!expiry){status("Confirm at least one detail first.","error");return;}
  if(currency&&!api.currencies.includes(currency)){status("Select INR, CAD or USD.","error");return;}
  if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>9999999999.99||Math.round(amount*100)/100!==amount)){
    status("Use a nonnegative balance with up to two decimals.","error");return;
  }
  if(expiry&&!api.parseDate(expiry)){status("Enter a valid expiry date.","error");return;}
  const approved=Boolean(result?.code&&get("gv-scan-code-consent").checked);
  // No network or save call here: it only supplies explicitly reviewed draft fields.
  try{
    handler({store:store.slice(0,100),currency,amount,expiry,code:approved?result.code.value:null,codeConfirmed:approved});
    close();
  }catch{status("Could not apply the draft. Nothing has been saved.","error");}
}
window.GiftVaultScan=Object.freeze({open,close,isOpen:()=>Boolean(root&&!root.hidden)});
})();
