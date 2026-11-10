import {buildMould} from './mould.mjs';
self.onmessage=async({data})=>{try{postMessage(await buildMould(data.model,data.options,progress=>postMessage({progress})));}catch(e){postMessage({error:e.message});}};
