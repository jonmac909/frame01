export type Pose={frame:number;scale:number;x:number;y:number};
export type TimedWord={text:string;from:number;highlight?:boolean};
export type FullShot={id:string;from:number;to:number;sourceStart:number;sourceEnd:number;kind:string;asset?:string;trim?:number;card?:boolean;camera?:Pose[];note?:string;words?:TimedWord[];parts?:{from:number;to:number;asset:string;trim:number;scale?:number;origin?:string}[]};
export type ReviewEffects={bananaCard:string;font:string;flashes:number[];ctas:{from:number;to:number}[];titles:{from:number;to:number;text:string}[]};
export type FullPlan={fps:30;frames:number;baseUrl:string;aroll:string;whoosh:string;shots:FullShot[];speech:{from:number;to:number;trim:number}[];sound:{from:number;to:number;asset:string;trim:number;gain:number}[];sfx:number[];sections:{name:string;from:number;to:number;sourceFrom:number;sourceTo:number}[];limitations:string[];reviewEffects?:ReviewEffects};
