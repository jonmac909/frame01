'use strict';
const selectedClip=new URLSearchParams(location.search).get('clip');
const script=document.createElement('script');
script.src=(selectedClip==='opening'||selectedClip==='motion'?'review.js':'full-review.js')+'?v=measured-full-runtimes-20261017';
document.head.append(script);
