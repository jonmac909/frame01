let recorder,stream,chunks=[],projectId,token;
chrome.runtime.onMessage.addListener((m,_sender,reply)=>{
  if(m.target!=='offscreen')return;
  (async()=>{
    if(m.type==='start'){
      if(recorder?.state==='recording')throw new Error('A tab recording is already running.');
      projectId=m.projectId;token=m.token;chunks=[];
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:m.streamId,maxWidth:1920,maxHeight:1080,maxFrameRate:30}}});
      recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start(1000);return {recording:true};
    }
    if(m.type==='stop'){
      if(!recorder||recorder.state!=='recording')throw new Error('No tab recording is active.');
      await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop()});stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(chunks,{type:'video/webm'});const r=await fetch(`http://127.0.0.1:4317/bridge/recording/${projectId}`,{method:'POST',headers:{'Content-Type':'video/webm','X-Editor-Token':token},body:blob});const result=await r.json();if(!r.ok)throw new Error(result.error);chunks=[];return result;
    }throw new Error('Unsupported recorder operation.');
  })().then(reply).catch(e=>reply({error:e.message}));return true;
});
