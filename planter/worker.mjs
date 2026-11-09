import {build} from './model.mjs';
self.onmessage=async({data})=>{try{const result=await build(data,message=>postMessage({progress:message}));postMessage(result,[result.positions.buffer,result.indices.buffer,result.pattern.data.buffer]);}catch(error){postMessage({error:error.message});}};
