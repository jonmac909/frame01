"""Independent speech-content QA using the installed Qwen ASR on CPU only."""
from pathlib import Path
import json,os,re,subprocess,time,difflib
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import torch,soundfile as sf
from transformers import AutoProcessor,AutoModelForMultimodalLM
root=Path(__file__).resolve().parents[1]
project=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
out=root/'../../work/replacement-audio-qa'
out.mkdir(parents=True,exist_ok=True)
media=project/'assets/sienna-shop-drop-1x-2388109a9b1f485794191d8042820f0d.mp4'
wav=out/'replacement.wav'
if not wav.exists():subprocess.run([r'C:\ffmpeg\bin\ffmpeg.exe','-hide_banner','-loglevel','error','-i',str(media),'-vn','-ac','1','-ar','16000',str(wav)],check=True)
install=Path(r'C:\Users\jonst\Documents\Codex\Local Models\Qwen3-ASR-1.7B-hf/model')
torch.set_num_threads(8)
processor=AutoProcessor.from_pretrained(install,local_files_only=True)
model=AutoModelForMultimodalLM.from_pretrained(install,local_files_only=True,dtype=torch.float32,device_map='cpu',attn_implementation='sdpa')
audio,sr=sf.read(wav,dtype='float32');assert sr==16000
rows=[]
for n,start in enumerate(range(0,len(audio),30*sr)):
    saved=out/f'chunk-{n:03}.json'
    if saved.exists():row=json.loads(saved.read_text(encoding='utf-8'))
    else:
        began=time.monotonic();chunk=audio[start:start+30*sr]
        inputs=processor.apply_transcription_request(audio=chunk).to(model.device,model.dtype)
        with torch.inference_mode():output=model.generate(**inputs,max_new_tokens=256,do_sample=False)
        ids=output[:,inputs['input_ids'].shape[1]:]
        row={'start':start/sr,'end':min(len(audio),start+30*sr)/sr,'seconds':time.monotonic()-began,**processor.decode(ids,return_format='parsed')[0]}
        saved.write_text(json.dumps(row,indent=2),encoding='utf-8')
        del inputs,output,ids
    rows.append(row);print(json.dumps({'chunk':n,'start':row['start'],'text':row['transcription'][:90]}),flush=True)
expected=re.findall(r"[a-z0-9]+",(project/'Rewritten narration.txt').read_text(encoding='utf-8').lower())
heard=re.findall(r"[a-z0-9]+",' '.join(r['transcription']for r in rows).lower())
matcher=difflib.SequenceMatcher(None,expected,heard,autojunk=False)
differences=[{'kind':tag,'expected':' '.join(expected[a:b]),'heard':' '.join(heard[c:d])}for tag,a,b,c,d in matcher.get_opcodes()if tag!='equal']
report={'source':str(media),'device':'cpu','model':'installed Qwen3-ASR-1.7B','audioDuration':len(audio)/sr,'expectedWords':len(expected),'heardWords':len(heard),'sequenceMatchRatio':matcher.ratio(),'differences':differences,'chunks':rows,'limitations':['Chunk boundary words may be split; ASR differences need human interpretation.','This checks speech content, not speaker identity or audiovisual lip sync.']}
(project/'Replacement independent audio QA.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items()if k not in ['chunks','differences']}),flush=True)
