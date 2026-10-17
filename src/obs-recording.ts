import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,run} from './core.js';
import type {CaptureWindow} from './window-recording.js';
export const OBS_ROOT=path.join(ROOT,'.runtime/obs');
export const OBS_EXE=path.join(OBS_ROOT,'bin/64bit/obs64.exe');
export async function configureObs(target:CaptureWindow,rawDirectory:string,cropTop:number){
 await fs.access(OBS_EXE);
 const config=path.join(OBS_ROOT,'config/obs-studio'),profile=path.join(config,'basic/profiles/Frame01'),scenes=path.join(config,'basic/scenes');
 await fs.mkdir(profile,{recursive:true});await fs.mkdir(scenes,{recursive:true});await fs.mkdir(rawDirectory,{recursive:true});
 // Preserve the stale crash marker from our own failed startup; the recorder lock is already held.
 const sentinel=path.join(config,'.sentinel');await fs.rename(sentinel,sentinel+'-recovered-'+Date.now()).catch(e=>{if(e.code!=='ENOENT')throw e});
 await fs.writeFile(path.join(OBS_ROOT,'portable_mode.txt'),'');
 await fs.mkdir(path.join(config,'plugin_config/obs-websocket'),{recursive:true});
 await fs.writeFile(path.join(config,'plugin_config/obs-websocket/config.json'),JSON.stringify({server_enabled:false,auth_required:true,alerts_enabled:false}));
 await fs.writeFile(path.join(config,'global.ini'),'[General]\nFirstRun=true\nEnableAutoUpdates=false\n[Basic]\nProfile=Frame01\nProfileDir=Frame01\nSceneCollection=Frame01\nSceneCollectionFile=Frame01\n[BasicWindow]\nWarnBeforeStoppingRecord=false\nWarnBeforeStartingRecord=false\n');
 await fs.writeFile(path.join(config,'user.ini'),'[General]\nFirstRun=true\nConfirmOnExit=false\n[Basic]\nProfile=Frame01\nProfileDir=Frame01\nSceneCollection=Frame01\nSceneCollectionFile=Frame01\nConfigOnNewProfile=false\n[BasicWindow]\nWarnBeforeStoppingRecord=false\nWarnBeforeStartingRecord=false\nSysTrayEnabled=true\nSysTrayWhenStarted=true\n');
 await fs.writeFile(path.join(profile,'basic.ini'),`[General]\nName=Frame01\n[Video]\nBaseCX=1920\nBaseCY=1080\nOutputCX=1920\nOutputCY=1080\nFPSType=0\nFPSCommon=30\n[Output]\nMode=Simple\nFilenameFormatting=capture\nOverwriteIfExists=true\n[SimpleOutput]\nFilePath=${rawDirectory.replaceAll('\\','/')}\nRecFormat=mkv\nRecFormat2=mkv\nRecQuality=HQ\nRecEncoder=x264\nRecRB=false\n[Audio]\nSampleRate=48000\nChannelSetup=Stereo\n`);
 const capture={name:'Walkthrough',id:'window_capture',versioned_id:'window_capture',settings:{window:target.title+':Chrome_WidgetWin_1:chrome.exe',priority:0,method:2,cursor:true,client_area:true,capture_audio:false},mixers:0,muted:true,enabled:true};
 const scene={name:'Frame01',id:'scene',versioned_id:'scene',settings:{items:[{name:'Walkthrough',id:1,visible:true,locked:false,pos:{x:0,y:0},scale:{x:1,y:1},bounds_type:2,bounds:{x:1920,y:1080},align:5,bounds_align:0,crop_top:cropTop,crop_bottom:0,crop_left:0,crop_right:0}]},mixers:0};
 await fs.writeFile(path.join(scenes,'Frame01.json'),JSON.stringify({name:'Frame01',current_scene:'Frame01',current_program_scene:'Frame01',scene_order:[{name:'Frame01'}],sources:[capture,scene],groups:[],transitions:[],quick_transitions:[],saved_projectors:[],current_transition:'Fade',transition_duration:300},null,2));
 // Only bundled modules; websocket server stays disabled. No remote-control port or desktop audio.
 return ['--portable','--only-bundled-plugins','--profile','Frame01','--collection','Frame01','--scene','Frame01','--minimize-to-tray','--disable-updater','--disable-missing-files-check','--startrecording'];
}
export async function closeOwnedObs(pid:number){await run(path.join(ROOT,'bin/capture-windows.exe'),['--close-obs',String(pid),OBS_EXE],{timeout:15000})}
