const base='http://127.0.0.1:4317';let polling=false;
async function post(route,body){const {token}=await chrome.storage.local.get('token');const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Token':token},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data}
// This function executes only in a tab explicitly attached from the extension popup.
function pageOperation(method,args){
  if(method==='inspect'){
    const speeds=[...document.querySelectorAll('input[type=range],[role=slider]')].filter(e=>{const r=e.getBoundingClientRect();const label=e.getAttribute('aria-label')||e.parentElement?.parentElement?.textContent||'';return r.width>0&&r.height>0&&/^Speed\b/i.test(label.trim())}).map(e=>Number(e.getAttribute('aria-valuenow')??e.value));
    return {url:location.href,text:document.body.innerText,voiceSpeed:speeds.length===1&&Number.isFinite(speeds[0])?speeds[0]:null,values:[...document.querySelectorAll('textarea,input:not([type=password]),[contenteditable=true]')].map(e=>e.value||e.textContent).join(' ')};
  }
  if(method==='snapshot'){
    const rev=Date.now().toString(36);const elements=[...document.querySelectorAll('button,a,input,textarea,select,[role=button],[role=combobox],[role=option],[role=menuitem],[contenteditable=true]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).slice(0,350).map((e,i)=>{const ref=`e${rev}-${i}`;e.dataset.frameRef=ref;const sensitive=e.type==='password'||/one-time-code|cc-/.test(e.autocomplete||'');return {ref,tag:e.tagName.toLowerCase(),text:(e.getAttribute('aria-label')||e.innerText||e.placeholder||'').trim().slice(0,180),value:sensitive?'[redacted]':e.value,href:e.href||'',sensitive}});return {url:location.href,text:document.body.innerText.slice(0,22000),elements};
  }
  if(method==='act'){
    if(args.action==='scroll'){window.scrollBy({top:Math.max(-2000,Math.min(2000,Number(args.value)||700)),behavior:'smooth'});return {ok:true}}
    const e=[...document.querySelectorAll('[data-frame-ref]')].find(el=>el.dataset.frameRef===args.ref);if(!e)throw new Error('Stale element reference.');
    if(e.type==='password'||/one-time-code|cc-/.test(e.autocomplete||''))throw new Error('Sensitive fields require manual input.');
    e.scrollIntoView({block:'center'});e.focus();
    if(args.action==='click')e.click();
    else if(args.action==='fill'){if(e.isContentEditable){e.textContent=args.value;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:args.value}))}else{const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,args.value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}}
    else if(args.action==='press'){e.dispatchEvent(new KeyboardEvent('keydown',{key:args.value,bubbles:true}));e.dispatchEvent(new KeyboardEvent('keyup',{key:args.value,bubbles:true}))}else throw new Error('Unsupported action.');return {ok:true};
  }throw new Error('Unsupported page operation.');
}
async function execute(cmd){
  if(cmd.method==='navigate'){await chrome.tabs.update(cmd.tabId,{url:cmd.args.url});return {ok:true}}
  if(cmd.method==='record.start'){
    if(!await chrome.offscreen.hasDocument())await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'Record the walkthrough tab selected by the user.'});
    const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:cmd.tabId});const {token}=await chrome.storage.local.get('token');return chrome.runtime.sendMessage({target:'offscreen',type:'start',streamId,projectId:cmd.projectId,token});
  }
  if(cmd.method==='record.stop')return chrome.runtime.sendMessage({target:'offscreen',type:'stop'});
  const result=(await chrome.scripting.executeScript({target:{tabId:cmd.tabId},func:pageOperation,args:[cmd.method,cmd.args]}))[0]?.result;
  if(cmd.method==='snapshot'){const tab=await chrome.tabs.get(cmd.tabId);await chrome.tabs.update(cmd.tabId,{active:true});try{result.imageBase64=(await chrome.tabs.captureVisibleTab(tab.windowId,{format:'jpeg',quality:70})).split(',')[1]}catch{}}
  return result;
}
async function poll(){if(polling)return;polling=true;try{while(true){const {token}=await chrome.storage.local.get('token');if(!token)break;const cmd=await post('/bridge/poll',{});if(!cmd.id){await new Promise(r=>setTimeout(r,1000));continue}try{const result=await execute(cmd);if(result?.error)throw new Error(result.error);await post('/bridge/result',{id:cmd.id,result})}catch(e){await post('/bridge/result',{id:cmd.id,error:e.message})}}}catch{}finally{polling=false}}
chrome.runtime.onMessage.addListener((m,_s,reply)=>{if(m.type==='connect'){void poll();reply({ok:true})}});
chrome.alarms.create('reconnect',{periodInMinutes:.5});chrome.alarms.onAlarm.addListener(()=>void poll());chrome.runtime.onStartup.addListener(()=>void poll());void poll();
