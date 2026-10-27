import {rebuild} from './rebuild.js?v=3';
self.onmessage=({data:m})=>{try{self.postMessage({id:m.id,...rebuild(m.data,m.cloud)})}catch(e){self.postMessage({id:m.id,error:e.message})}};
