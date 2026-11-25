/* Minimal, consistent outline icon set. Built-in SVG paths; no icon font or external CDN.
 * Only changes presentation. It does not request data or cache secrets. */
(()=>{
'use strict';
const NS='http://www.w3.org/2000/svg';
const SHAPES={"ticket":"<path d=\"M4 7a2 2 0 0 0 2-2h12v4a2 2 0 0 0 0 4v6H6a2 2 0 0 0-2-2V7Z\"/><path d=\"M12 5v2m0 3v2m0 3v2m0 2v-1\"/>","vault":"<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 8v8m-4-4h8\"/>","bell":"<path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9\"/><path d=\"M10 21h4\"/>","gift":"<rect x=\"3\" y=\"8\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"M12 8v13M3 12h18\"/><path d=\"M12 8c-3 0-5-1-5-3 0-3 5-3 5 3Zm0 0c3 0 5-1 5-3 0-3-5-3-5 3Z\"/>","search":"<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m16 16 5 5\"/>","crown":"<path d=\"m2 8 5 4 5-7 5 7 5-4-2 11H4L2 8Z\"/><path d=\"M4 19h16\"/>","plus":"<path d=\"M12 5v14M5 12h14\"/>","log-out":"<path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/><path d=\"m16 17 5-5-5-5M21 12H9\"/>","save":"<path d=\"M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z\"/><path d=\"M17 21v-8H7v8M7 3v6h8\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M3 10h18M8 15h2\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>","history":"<path d=\"M3 12a9 9 0 1 0 3-6.7L3 8\"/><path d=\"M3 3v5h5M12 7v5l4 2\"/>","check-circle":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8 12 3 3 5-6\"/>","folder-open":"<path d=\"M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v2\"/><path d=\"M3 20h16l3-10H6L3 20Z\"/>","store":"<path d=\"M3 10 5 3h14l2 7\"/><path d=\"M4 10v11h16V10M9 21v-7h6v7M2 10h20\"/>","wallet":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"15\" rx=\"2\"/><path d=\"M16 12h5M3 8h18\"/>","users":"<circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m4 9v-2a6 6 0 0 0-4-5.65\"/>","user":"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>","hand-coins":"<path d=\"M3 14h3l4 3h6a3 3 0 0 0 3-3H12\"/><path d=\"M3 20h4l3 1h7l4-5M3 14v6M9 7a5 5 0 1 1 10 0 5 5 0 0 1-10 0Z\"/>","settings":"<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"m19 12 2-1-2-4-2 1-2-1-.5-2h-5L9 7 7 8 5 7l-2 4 2 1v2l-2 1 2 4 2-1 2 1 .5 2h5l.5-2 2-1 2 1 2-4-2-1v-2Z\"/>","mail":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 7 9 6 9-6\"/>","lock":"<rect x=\"4\" y=\"10\" width=\"16\" height=\"11\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3M12 14v3\"/>","key":"<circle cx=\"8\" cy=\"15\" r=\"4\"/><path d=\"m11 12 9-9 2 2-2 2 1 1-3 3-2-2-3 3\"/>","eye":"<path d=\"M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","eye-off":"<path d=\"m3 3 18 18M10.5 5.2c.5-.1 1-.2 1.5-.2 6 0 10 7 10 7a17 17 0 0 1-3.3 4.1M7.2 7.2A17 17 0 0 0 2 12s4 7 10 7c1.4 0 2.7-.4 3.9-1.1\"/>","globe":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18\"/>","pencil":"<path d=\"m16 4 4 4M4 20l5-.9L20.3 6.8a2.8 2.8 0 0 0-4-4L5 14.1 4 20Z\"/>","trash":"<path d=\"M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6M14 11v6\"/>","refresh":"<path d=\"M21 3v6h-6M3 21v-6h6\"/><path d=\"M5 9a8 8 0 0 1 14-3l2 3M3 15l2 3a8 8 0 0 0 14-3\"/>","arrow-up":"<path d=\"M12 20V4M6 10l6-6 6 6\"/>","arrow-down":"<path d=\"M12 4v16M6 14l6 6 6-6\"/>","alert-triangle":"<path d=\"m10.3 3.8-8.4 14a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3l-8.4-14a2 2 0 0 0-3.4 0Z\"/><path d=\"M12 9v4m0 4h.01\"/>","info":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5m0-8h.01\"/>","sparkles":"<path d=\"m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3ZM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z\"/>","badge-check":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8 12 3 3 5-6\"/>","x":"<path d=\"M18 6 6 18M6 6l12 12\"/>","link":"<path d=\"M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2\"/><path d=\"M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2\"/>","shopping-bag":"<path d=\"M3 8h18l-1.5 13h-15L3 8Z\"/><path d=\"M8 9V6a4 4 0 0 1 8 0v3\"/>","tag":"<path d=\"M2 3h10l10 10-9 9L3 12V3Z\"/><circle cx=\"8\" cy=\"8\" r=\"1\"/>","file-text":"<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z\"/><path d=\"M14 2v6h6M8 13h8M8 17h8\"/>","message-circle":"<path d=\"M20 11a8 8 0 0 1-8 8 9 9 0 0 1-4-.8L3 20l1.8-5A8 8 0 1 1 20 11Z\"/>"};
const GLYPHS={"🎟️":"ticket","🗄️":"vault","🔔":"bell","🎁":"gift","🛍️":"shopping-bag","🛒":"shopping-bag","👑":"crown","➕":"plus","🚪":"log-out","💾":"save","📅":"calendar","🗓️":"calendar","⏰":"clock","🗂️":"folder-open","✔️":"check-circle","✅":"check-circle","🏢":"store","👀":"eye","👤":"user","💸":"hand-coins","⚙️":"settings","✉️":"mail","📧":"mail","🔐":"lock","🔒":"lock","🔑":"key","👁️":"eye","🙈":"eye-off","🌐":"globe","✏️":"pencil","✍️":"pencil","🗑️":"trash","🔄":"refresh","⬆️":"arrow-up","⬇️":"arrow-down","⚠️":"alert-triangle","🚨":"alert-triangle","ℹ️":"info","💡":"sparkles","⚡":"sparkles","🔗":"link","🏷️":"tag","📜":"file-text","📋":"file-text","📝":"pencil","⏳":"clock","❌":"x"};
const PATTERN=new RegExp(Object.keys(GLYPHS).sort((a,b)=>b.length-a.length).join('|'),'gu');
function make(name){
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('class','ui-icon');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('width','18');
  svg.setAttribute('height','18');
  svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','1.8');
  svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('stroke-linejoin','round');
  svg.setAttribute('aria-hidden','true');
  svg.innerHTML=SHAPES[name]; // only checked-in static SVG path definitions
  return svg;
}
function convert(node){
  if(!node||node.nodeType!==3||!node.parentElement)return;
  const parent=node.parentElement;
  if(parent.closest('script,style,textarea,pre,code,.code-text,[contenteditable="true"]'))return;
  const value=node.nodeValue||'';
  PATTERN.lastIndex=0;
  if(!PATTERN.test(value))return;
  PATTERN.lastIndex=0;
  if(parent.closest('option,optgroup')){
    node.nodeValue=value.replace(PATTERN,'').replace(/\s+/g,' ').trim();
    return;
  }
  const button=parent.closest('button');
  if(button&&!button.getAttribute('aria-label')){
    const onlyIcon=value.trim();
    if(GLYPHS[onlyIcon])button.setAttribute('aria-label',onlyIcon==='🗑️'?'Delete':onlyIcon==='🔄'?'Refresh':onlyIcon==='👁️'?'Show':GLYPHS[onlyIcon].replace(/-/g,' '));
  }
  const frag=document.createDocumentFragment();
  let last=0;
  for(const m of value.matchAll(PATTERN)){
    if(m.index>last)frag.append(document.createTextNode(value.slice(last,m.index)));
    frag.append(make(GLYPHS[m[0]]));
    last=m.index+m[0].length;
  }
  if(last<value.length)frag.append(document.createTextNode(value.slice(last)));
  node.replaceWith(frag);
}
function scan(root){
  if(root.nodeType===3){convert(root);return;}
  if(root.nodeType!==1&&root.nodeType!==11)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const todo=[];
  while(walker.nextNode())todo.push(walker.currentNode);
  for(const node of todo)if(node.isConnected)convert(node);
}
function start(){
  if(!document.body)return;
  scan(document.body);
  const observer=new MutationObserver(changes=>{
    for(const change of changes){
      for(const node of change.addedNodes)scan(node);
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
