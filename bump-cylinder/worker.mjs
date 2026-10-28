import {mesh} from './core.mjs';
self.onmessage=({data})=>{try{const m=mesh(data.settings,data.image);self.postMessage({id:data.id,...m},[m.positions.buffer,m.indices.buffer]);}catch(error){self.postMessage({id:data.id,error:error.message});}};
