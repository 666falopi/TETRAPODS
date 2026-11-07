import {build} from './core.mjs?v=3'; self.onmessage=({data})=>{try{let m=build(data);postMessage(m,[m.positions.buffer,m.indices.buffer]);}catch(e){postMessage({error:e.message});}};
