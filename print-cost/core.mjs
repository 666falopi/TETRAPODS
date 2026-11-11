export const materials=[{id:'pla',name:'PLA genérico',price:13000},{id:'petg',name:'PETG',price:15000},{id:'tpu',name:'TPU',price:16000}];
export const defaults={watts:800,tariff:286.2,laborRate:6250,machineRate:300};
export const example={name:'Molde tetrapodo',client:'',materialId:'pla',grams:576,hours:15,minutes:0,laborMinutes:0,markup:30,extra:0,notes:''};
export function calculate(q,r,price){
 for(const v of [q.grams,q.hours,q.minutes,q.laborMinutes,q.markup,q.extra,r.watts,r.tariff,r.laborRate,r.machineRate,price]) if(!Number.isFinite(v)||v<0) throw Error('Completa los valores con números iguales o mayores que cero.');
 if(q.minutes>=60) throw Error('Los minutos de impresión deben estar entre 0 y 59.');
 const hours=q.hours+q.minutes/60;
 const filament=q.grams/1000*price,energy=hours*r.watts/1000*r.tariff,labor=q.laborMinutes/60*r.laborRate,machine=hours*r.machineRate;
 const cost=filament+energy+labor+machine+q.extra,profit=cost*q.markup/100,total=cost+profit;
 if(!Number.isFinite(total))throw Error('Los valores son demasiado grandes.');
 return {hours,filament,energy,labor,machine,extra:q.extra,cost,profit,total,margin:total?profit/total*100:0,kwh:hours*r.watts/1000};
}
