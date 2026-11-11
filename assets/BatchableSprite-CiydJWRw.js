import{k as ct,E as T,h as ht,u as q,n as dt,A as J,F as ft,C as U,H as Z,I as mt,J as pt,e as V,f as C,w as xt,b as vt,G as gt,K as _t,S as bt}from"./CanvasPool-DKwixkad.js";const M=[];ct.handleByNamedList(T.Environment,M);async function yt(n){if(!n)for(let t=0;t<M.length;t++){const e=M[t];if(e.value.test()){await e.value.load();return}}}let I;function St(){if(typeof I=="boolean")return I;try{I=new Function("param1","param2","param3","return param1[param2] === param3;")({a:"b"},"a","b")===!0}catch{I=!1}return I}var tt=(n=>(n[n.NONE=0]="NONE",n[n.COLOR=16384]="COLOR",n[n.STENCIL=1024]="STENCIL",n[n.DEPTH=256]="DEPTH",n[n.COLOR_DEPTH=16640]="COLOR_DEPTH",n[n.COLOR_STENCIL=17408]="COLOR_STENCIL",n[n.DEPTH_STENCIL=1280]="DEPTH_STENCIL",n[n.ALL=17664]="ALL",n))(tt||{});class wt{constructor(t){this.items=[],this._name=t}emit(t,e,r,i,s,u,o,l){const{name:h,items:m}=this;for(let d=0,f=m.length;d<f;d++)m[d][h](t,e,r,i,s,u,o,l);return this}add(t){return t[this._name]&&(this.remove(t),this.items.push(t)),this}remove(t){const e=this.items.indexOf(t);return e!==-1&&this.items.splice(e,1),this}contains(t){return this.items.indexOf(t)!==-1}removeAll(){return this.items.length=0,this}destroy(){this.removeAll(),this.items=null,this._name=null}get empty(){return this.items.length===0}get name(){return this._name}}const It=["init","destroy","contextChange","resolutionChange","resetState","renderEnd","renderStart","render","update","postrender","prerender"],et=class rt extends ht{constructor(t){super(),this.tick=0,this.uid=q("renderer"),this.runners=Object.create(null),this.renderPipes=Object.create(null),this._initOptions={},this._systemsHash=Object.create(null),this.type=t.type,this.name=t.name,this.config=t;const e=[...It,...this.config.runners??[]];this._addRunners(...e),this._unsafeEvalCheck()}async init(t={}){const e=t.skipExtensionImports===!0?!0:t.manageImports===!1;await yt(e),!e&&this.config.loaders&&await Promise.all(this.config.loaders.map(r=>r.value.load())),this._addSystems(this.config.systems),this._addPipes(this.config.renderPipes,this.config.renderPipeAdaptors);for(const r in this._systemsHash)t={...this._systemsHash[r].constructor.defaultOptions,...t};t={...rt.defaultOptions,...t},this._roundPixels=t.roundPixels?1:0;for(let r=0;r<this.runners.init.items.length;r++)await this.runners.init.items[r].init(t);this._initOptions=t}render(t,e){this.tick++;let r=t;if(r instanceof dt&&(r={container:r},e&&(J(ft,"passing a second argument is deprecated, please use render options instead"),r.target=e.renderTexture)),r.target||(r.target=this.view.renderTarget),r.target===this.view.renderTarget&&(this._lastObjectRendered=r.container,r.clearColor??(r.clearColor=this.background.colorRgba),r.clear??(r.clear=this.background.clearBeforeRender)),r.clearColor){const i=Array.isArray(r.clearColor)&&r.clearColor.length===4;r.clearColor=i?r.clearColor:U.shared.setValue(r.clearColor).toArray()}r.transform||(r.container.updateLocalTransform(),r.transform=r.container.localTransform),r.container.visible&&(r.container.enableRenderGroup(),this.runners.prerender.emit(r),this.runners.renderStart.emit(r),this.runners.render.emit(r),this.runners.renderEnd.emit(r),this.runners.postrender.emit(r))}resize(t,e,r){const i=this.view.resolution;this.view.resize(t,e,r),this.emit("resize",this.view.screen.width,this.view.screen.height,this.view.resolution),r!==void 0&&r!==i&&this.runners.resolutionChange.emit(r)}clear(t={}){const e=this;t.target||(t.target=e.renderTarget.renderTarget),t.clearColor||(t.clearColor=this.background.colorRgba),t.clear??(t.clear=tt.ALL);const{clear:r,clearColor:i,target:s,mipLevel:u,layer:o}=t;U.shared.setValue(i??this.background.colorRgba),e.renderTarget.clear(s,r,U.shared.toArray(),u??0,o??0)}get resolution(){return this.view.resolution}set resolution(t){this.view.resolution=t,this.runners.resolutionChange.emit(t)}get width(){return this.view.texture.frame.width}get height(){return this.view.texture.frame.height}get canvas(){return this.view.canvas}get lastObjectRendered(){return this._lastObjectRendered}get renderingToScreen(){return this.renderTarget.renderingToScreen}get screen(){return this.view.screen}_addRunners(...t){t.forEach(e=>{this.runners[e]=new wt(e)})}_addSystems(t){let e;for(e in t){const r=t[e];this._addSystem(r.value,r.name)}}_addSystem(t,e){const r=new t(this);if(this[e])throw new Error(`Whoops! The name "${e}" is already in use`);this[e]=r,this._systemsHash[e]=r;for(const i in this.runners)this.runners[i].add(r);return this}_addPipes(t,e){const r=e.reduce((i,s)=>(i[s.name]=s.value,i),{});t.forEach(i=>{const s=i.value,u=i.name,o=r[u];this.renderPipes[u]=new s(this,o?new o:null),this.runners.destroy.add(this.renderPipes[u])})}destroy(t=!1){this.runners.destroy.items.reverse(),this.runners.destroy.emit(t),(t===!0||typeof t=="object"&&t.releaseGlobalResources)&&Z.release(),Object.values(this.runners).forEach(e=>{e.destroy()}),this._systemsHash=null,this.renderPipes=null,this.removeAllListeners()}generateTexture(t){return this.textureGenerator.generateTexture(t)}get roundPixels(){return!!this._roundPixels}_unsafeEvalCheck(){if(!St())throw new Error("Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.")}resetState(){this.runners.resetState.emit()}};et.defaultOptions={resolution:1,failIfMajorPerformanceCaveat:!1,roundPixels:!1};let de=et;const nt="8.23.0";class Bt{static init(){globalThis.__PIXI_APP_INIT__?.(this,nt)}static destroy(){}}Bt.extension=T.Application;class At{constructor(t){this._renderer=t}init(){globalThis.__PIXI_RENDERER_INIT__?.(this._renderer,nt)}destroy(){this._renderer=null}}At.extension={type:[T.WebGLSystem,T.WebGPUSystem],name:"initHook",priority:-10};class D{constructor(t){typeof t=="number"?this.rawBinaryData=new ArrayBuffer(t):t instanceof Uint8Array?this.rawBinaryData=t.buffer:this.rawBinaryData=t,this.uint32View=new Uint32Array(this.rawBinaryData),this.float32View=new Float32Array(this.rawBinaryData),this.size=this.rawBinaryData.byteLength}get int8View(){return this._int8View||(this._int8View=new Int8Array(this.rawBinaryData)),this._int8View}get uint8View(){return this._uint8View||(this._uint8View=new Uint8Array(this.rawBinaryData)),this._uint8View}get int16View(){return this._int16View||(this._int16View=new Int16Array(this.rawBinaryData)),this._int16View}get int32View(){return this._int32View||(this._int32View=new Int32Array(this.rawBinaryData)),this._int32View}get float64View(){return this._float64Array||(this._float64Array=new Float64Array(this.rawBinaryData)),this._float64Array}get bigUint64View(){return this._bigUint64Array||(this._bigUint64Array=new BigUint64Array(this.rawBinaryData)),this._bigUint64Array}view(t){return this[`${t}View`]}destroy(){this.rawBinaryData=null,this.uint32View=null,this.float32View=null,this.uint16View=null,this._int8View=null,this._uint8View=null,this._int16View=null,this._int32View=null,this._float64Array=null,this._bigUint64Array=null}static sizeOf(t){switch(t){case"int8":case"uint8":return 1;case"int16":case"uint16":return 2;case"int32":case"uint32":case"float32":return 4;default:throw new Error(`${t} isn't a valid view type`)}}}function $(n,t,e,r){if(e??(e=0),r??(r=Math.min(n.byteLength-e,t.byteLength)),!(e&7)&&!(r&7)){const i=r/8;new Float64Array(t,0,i).set(new Float64Array(n,e,i))}else if(!(e&3)&&!(r&3)){const i=r/4;new Float32Array(t,0,i).set(new Float32Array(n,e,i))}else new Uint8Array(t).set(new Uint8Array(n,e,r))}const Pt={normal:"normal-npm",add:"add-npm",screen:"screen-npm"};var Tt=(n=>(n[n.DISABLED=0]="DISABLED",n[n.RENDERING_MASK_ADD=1]="RENDERING_MASK_ADD",n[n.MASK_ACTIVE=2]="MASK_ACTIVE",n[n.INVERSE_MASK_ACTIVE=3]="INVERSE_MASK_ACTIVE",n[n.RENDERING_MASK_REMOVE=4]="RENDERING_MASK_REMOVE",n[n.NONE=5]="NONE",n))(Tt||{});function H(n,t){return t.alphaMode==="no-premultiply-alpha"&&Pt[n]||n}const Ct=["precision mediump float;","void main(void){","float test = 0.1;","%forloop%","gl_FragColor = vec4(0.0);","}"].join(`
`);function zt(n){let t="";for(let e=0;e<n;++e)e>0&&(t+=`
else `),e<n-1&&(t+=`if(test == ${e}.0){}`);return t}function Ut(n,t){if(n===0)throw new Error("Invalid value of `0` passed to `checkMaxIfStatementsInShader`");const e=t.createShader(t.FRAGMENT_SHADER);try{for(;;){const r=Ct.replace(/%forloop%/gi,zt(n));if(t.shaderSource(e,r),t.compileShader(e),!t.getShaderParameter(e,t.COMPILE_STATUS))n=n/2|0;else break}}finally{t.deleteShader(e)}return n}let w=null;function Et(){if(w)return w;const n=mt();return w=n.getParameter(n.MAX_TEXTURE_IMAGE_UNITS),w=Ut(w,n),n.getExtension("WEBGL_lose_context")?.loseContext(),w}class Rt{constructor(){this.ids=Object.create(null),this.textures=[],this.count=0}clear(){for(let t=0;t<this.count;t++){const e=this.textures[t];this.textures[t]=null,this.ids[e.uid]=null}this.count=0}}class kt{constructor(){this.renderPipeId="batch",this.action="startBatch",this.start=0,this.size=0,this.textures=new Rt,this.blendMode="normal",this.topology="triangle-strip",this.canBundle=!0}destroy(){this.textures=null,this.gpuBindGroup=null,this.bindGroup=null,this.batcher=null,this.elements=null}}const P=[];let z=0;Z.register({clear:()=>{if(P.length>0)for(const n of P)n&&n.destroy();P.length=0,z=0}});function N(){return z>0?P[--z]:new kt}function j(n){n.elements=null,P[z++]=n}let B=0;const it=class st{constructor(t){this.uid=q("batcher"),this.dirty=!0,this.batchIndex=0,this.batches=[],this._elements=[],t={...st.defaultOptions,...t},t.maxTextures||(J("v8.8.0","maxTextures is a required option for Batcher now, please pass it in the options"),t.maxTextures=Et());const{maxTextures:e,attributesInitialSize:r,indicesInitialSize:i}=t;this.attributeBuffer=new D(r*4),this.indexBuffer=new Uint16Array(i),this.maxTextures=e}begin(){this.elementSize=0,this.elementStart=0,this.indexSize=0,this.attributeSize=0;for(let t=0;t<this.batchIndex;t++)j(this.batches[t]);this.batchIndex=0,this._batchIndexStart=0,this._batchIndexSize=0,this.dirty=!0}add(t){this._elements[this.elementSize++]=t,t._indexStart=this.indexSize,t._attributeStart=this.attributeSize,t._batcher=this,this.indexSize+=t.indexSize,this.attributeSize+=t.attributeSize*this.vertexSize}checkAndUpdateTexture(t,e){const r=t._batch.textures.ids[e._source.uid];return!r&&r!==0?!1:(t._textureId=r,t.texture=e,!0)}updateElement(t){this.dirty=!0;const e=this.attributeBuffer;t.packAsQuad?this.packQuadAttributes(t,e.float32View,e.uint32View,t._attributeStart,t._textureId):this.packAttributes(t,e.float32View,e.uint32View,t._attributeStart,t._textureId)}break(t){const e=this._elements;if(!e[this.elementStart])return;let r=N(),i=r.textures;i.clear();const s=e[this.elementStart];let u=H(s.blendMode,s.texture._source),o=s.topology;this.attributeSize*4>this.attributeBuffer.size&&this._resizeAttributeBuffer(this.attributeSize*4),this.indexSize>this.indexBuffer.length&&this._resizeIndexBuffer(this.indexSize);const l=this.attributeBuffer.float32View,h=this.attributeBuffer.uint32View,m=this.indexBuffer;let d=this._batchIndexSize,f=this._batchIndexStart,g="startBatch",p=[];const b=this.maxTextures;for(let v=this.elementStart;v<this.elementSize;++v){const a=e[v];e[v]=null;const c=a.texture._source,x=H(a.blendMode,c),_=u!==x||o!==a.topology;if(c._batchTick===B&&!_){a._textureId=c._textureBindLocation,d+=a.indexSize,a.packAsQuad?(this.packQuadAttributes(a,l,h,a._attributeStart,a._textureId),this.packQuadIndex(m,a._indexStart,a._attributeStart/this.vertexSize)):(this.packAttributes(a,l,h,a._attributeStart,a._textureId),this.packIndex(a,m,a._indexStart,a._attributeStart/this.vertexSize)),a._batch=r,p.push(a);continue}(i.count>=b||_)&&(this._finishBatch(r,f,d-f,i,u,o,t,g,p),g="renderBatch",f=d,u=x,o=a.topology,r=N(),i=r.textures,i.clear(),p=[],++B),c._batchTick=B,a._textureId=c._textureBindLocation=i.count,i.ids[c.uid]=i.count,i.textures[i.count++]=c,a._batch=r,p.push(a),d+=a.indexSize,a.packAsQuad?(this.packQuadAttributes(a,l,h,a._attributeStart,a._textureId),this.packQuadIndex(m,a._indexStart,a._attributeStart/this.vertexSize)):(this.packAttributes(a,l,h,a._attributeStart,a._textureId),this.packIndex(a,m,a._indexStart,a._attributeStart/this.vertexSize))}i.count>0&&(this._finishBatch(r,f,d-f,i,u,o,t,g,p),f=d,++B),this.elementStart=this.elementSize,this._batchIndexStart=f,this._batchIndexSize=d}_finishBatch(t,e,r,i,s,u,o,l,h){t.gpuBindGroup=null,t.bindGroup=null,t.action=l,t.batcher=this,t.textures=i,t.blendMode=s,t.topology=u,t.start=e,t.size=r,t.elements=h,++B,this.batches[this.batchIndex++]=t,o.add(t)}finish(t){this.break(t)}ensureAttributeBuffer(t){t*4<=this.attributeBuffer.size||this._resizeAttributeBuffer(t*4)}ensureIndexBuffer(t){t<=this.indexBuffer.length||this._resizeIndexBuffer(t)}_resizeAttributeBuffer(t){const e=Math.max(t,this.attributeBuffer.size*2),r=new D(e);$(this.attributeBuffer.rawBinaryData,r.rawBinaryData),this.attributeBuffer=r}_resizeIndexBuffer(t){const e=this.indexBuffer;let r=Math.max(t,e.length*1.5);r+=r%2;const i=r>65535?new Uint32Array(r):new Uint16Array(r);if(i.BYTES_PER_ELEMENT!==e.BYTES_PER_ELEMENT)for(let s=0;s<e.length;s++)i[s]=e[s];else $(e.buffer,i.buffer);this.indexBuffer=i}packQuadIndex(t,e,r){t[e]=r+0,t[e+1]=r+1,t[e+2]=r+2,t[e+3]=r+0,t[e+4]=r+2,t[e+5]=r+3}packIndex(t,e,r,i){const s=t.indices,u=t.indexSize,o=t.indexOffset,l=t.attributeOffset;for(let h=0;h<u;h++)e[r++]=i+s[h+o]-l}destroy(t={}){if(this.batches!==null){for(let e=0;e<this.batchIndex;e++)j(this.batches[e]);this.batches=null,this.geometry.destroy(!0),this.geometry=null,t.shader&&(this.shader?.destroy(),this.shader=null);for(let e=0;e<this._elements.length;e++)this._elements[e]&&(this._elements[e]._batch=null);this._elements=null,this.indexBuffer=null,this.attributeBuffer.destroy(),this.attributeBuffer=null}}};it.defaultOptions={maxTextures:null,attributesInitialSize:4,indicesInitialSize:6};let Mt=it;const Gt=new Float32Array(1),Vt=new Uint32Array(1);class Dt extends pt{constructor(){const e=new V({data:Gt,label:"attribute-batch-buffer",usage:C.VERTEX|C.COPY_DST,shrinkToFit:!1}),r=new V({data:Vt,label:"index-batch-buffer",usage:C.INDEX|C.COPY_DST,shrinkToFit:!1}),i=24;super({attributes:{aPosition:{buffer:e,format:"float32x2",stride:i,offset:0},aUV:{buffer:e,format:"float32x2",stride:i,offset:8},aColor:{buffer:e,format:"unorm8x4",stride:i,offset:16},aTextureIdAndRound:{buffer:e,format:"uint16x2",stride:i,offset:20}},indexBuffer:r})}}function O(n,t,e){if(n)for(const r in n){const i=r.toLocaleLowerCase(),s=t[i];if(s){let u=n[r];r==="header"&&(u=u.replace(/@in\s+[^;]+;\s*/g,"").replace(/@out\s+[^;]+;\s*/g,"")),e&&s.push(`//----${e}----//`),s.push(u)}else xt(`${r} placement hook does not exist in shader`)}}const $t=/\{\{(.*?)\}\}/g;function F(n){const t={};return(n.match($t)?.map(r=>r.replace(/[{()}]/g,""))??[]).forEach(r=>{t[r]=[]}),t}function W(n,t){let e;const r=/@in\s+([^;]+);/g;for(;(e=r.exec(n))!==null;)t.push(e[1])}function Q(n,t,e=!1){const r=[];W(t,r),n.forEach(o=>{o.header&&W(o.header,r)});const i=r;e&&i.sort();const s=i.map((o,l)=>`       @location(${l}) ${o},`).join(`
`);let u=t.replace(/@in\s+[^;]+;\s*/g,"");return u=u.replace("{{in}}",`
${s}
`),u}function K(n,t){let e;const r=/@out\s+([^;]+);/g;for(;(e=r.exec(n))!==null;)t.push(e[1])}function Ht(n){const e=/\b(\w+)\s*:/g.exec(n);return e?e[1]:""}function Nt(n){const t=/@.*?\s+/g;return n.replace(t,"")}function jt(n,t){const e=[];K(t,e),n.forEach(l=>{l.header&&K(l.header,e)});let r=0;const i=e.sort().map(l=>l.indexOf("builtin")>-1?l:`@location(${r++}) ${l}`).join(`,
`),s=e.sort().map(l=>`       var ${Nt(l)};`).join(`
`),u=`return VSOutput(
            ${e.sort().map(l=>` ${Ht(l)}`).join(`,
`)});`;let o=t.replace(/@out\s+[^;]+;\s*/g,"");return o=o.replace("{{struct}}",`
${i}
`),o=o.replace("{{start}}",`
${s}
`),o=o.replace("{{return}}",`
${u}
`),o}function X(n,t){let e=n;for(const r in t){const i=t[r];i.join(`
`).length?e=e.replace(`{{${r}}}`,`//-----${r} START-----//
${i.join(`
`)}
//----${r} FINISH----//`):e=e.replace(`{{${r}}}`,"")}return e}const y=Object.create(null),E=new Map;let Ot=0;function Ft({template:n,bits:t}){const e=at(n,t);if(y[e])return y[e];const{vertex:r,fragment:i}=Qt(n,t);return y[e]=ot(r,i,t),y[e]}function Wt({template:n,bits:t}){const e=at(n,t);return y[e]||(y[e]=ot(n.vertex,n.fragment,t)),y[e]}function Qt(n,t){const e=t.map(u=>u.vertex).filter(u=>!!u),r=t.map(u=>u.fragment).filter(u=>!!u);let i=Q(e,n.vertex,!0);i=jt(e,i);const s=Q(r,n.fragment,!0);return{vertex:i,fragment:s}}function at(n,t){return t.map(e=>(E.has(e)||E.set(e,Ot++),E.get(e))).sort((e,r)=>e-r).join("-")+n.vertex+n.fragment}function ot(n,t,e){const r=F(n),i=F(t);return e.forEach(s=>{O(s.vertex,r,s.name),O(s.fragment,i,s.name)}),{vertex:X(n,r),fragment:X(t,i)}}const Kt=`
    @in aPosition: vec2<f32>;
    @in aUV: vec2<f32>;

    @out @builtin(position) vPosition: vec4<f32>;
    @out vUV : vec2<f32>;
    @out vColor : vec4<f32>;

    {{header}}

    struct VSOutput {
        {{struct}}
    };

    @vertex
    fn main( {{in}} ) -> VSOutput {

        var worldTransformMatrix = globalUniforms.uWorldTransformMatrix;
        var modelMatrix = mat3x3<f32>(
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
          );
        var position = aPosition;
        var uv = aUV;

        {{start}}

        vColor = vec4<f32>(1., 1., 1., 1.);

        {{main}}

        vUV = uv;

        var modelViewProjectionMatrix = globalUniforms.uProjectionMatrix * worldTransformMatrix * modelMatrix;

        vPosition =  vec4<f32>((modelViewProjectionMatrix *  vec3<f32>(position, 1.0)).xy, 0.0, 1.0);

        vColor *= globalUniforms.uWorldColorAlpha;

        {{end}}

        {{return}}
    };
`,Xt=`
    @in vUV : vec2<f32>;
    @in vColor : vec4<f32>;

    {{header}}

    @fragment
    fn main(
        {{in}}
      ) -> @location(0) vec4<f32> {

        {{start}}

        var outColor:vec4<f32>;

        {{main}}

        var finalColor:vec4<f32> = outColor * vColor;

        {{end}}

        return finalColor;
      };
`,Lt=`
    in vec2 aPosition;
    in vec2 aUV;

    out vec4 vColor;
    out vec2 vUV;

    {{header}}

    void main(void){

        mat3 worldTransformMatrix = uWorldTransformMatrix;
        mat3 modelMatrix = mat3(
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
          );
        vec2 position = aPosition;
        vec2 uv = aUV;

        {{start}}

        vColor = vec4(1.);

        {{main}}

        vUV = uv;

        mat3 modelViewProjectionMatrix = uProjectionMatrix * worldTransformMatrix * modelMatrix;

        gl_Position = vec4((modelViewProjectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);

        vColor *= uWorldColorAlpha;

        {{end}}
    }
`,Yt=`

    in vec4 vColor;
    in vec2 vUV;

    out vec4 finalColor;

    {{header}}

    void main(void) {

        {{start}}

        vec4 outColor;

        {{main}}

        finalColor = outColor * vColor;

        {{end}}
    }
`,qt={name:"global-uniforms-bit",vertex:{header:`
        struct GlobalUniforms {
            uProjectionMatrix:mat3x3<f32>,
            uWorldTransformMatrix:mat3x3<f32>,
            uWorldColorAlpha: vec4<f32>,
            uResolution: vec2<f32>,
        }

        @group(0) @binding(0) var<uniform> globalUniforms : GlobalUniforms;
        `}},Jt={name:"global-uniforms-bit",vertex:{header:`
          uniform mat3 uProjectionMatrix;
          uniform mat3 uWorldTransformMatrix;
          uniform vec4 uWorldColorAlpha;
          uniform vec2 uResolution;
        `}};function Zt({bits:n,name:t}){const e=Ft({template:{fragment:Xt,vertex:Kt},bits:[qt,...n]});return gt.from({name:t,vertex:{source:e.vertex,entryPoint:"main"},fragment:{source:e.fragment,entryPoint:"main"}})}function te({bits:n,name:t}){return new vt({name:t,...Wt({template:{vertex:Lt,fragment:Yt},bits:[Jt,...n]})})}const ee={name:"color-bit",vertex:{header:`
            @in aColor: vec4<f32>;
        `,main:`
            vColor *= vec4<f32>(aColor.rgb * aColor.a, aColor.a);
        `}},re={name:"color-bit",vertex:{header:`
            in vec4 aColor;
        `,main:`
            vColor *= vec4(aColor.rgb * aColor.a, aColor.a);
        `}},R={};function ne(n){const t=[];if(n===1)t.push("@group(1) @binding(0) var textureSource1: texture_2d<f32>;"),t.push("@group(1) @binding(1) var textureSampler1: sampler;");else{let e=0;for(let r=0;r<n;r++)t.push(`@group(1) @binding(${e++}) var textureSource${r+1}: texture_2d<f32>;`),t.push(`@group(1) @binding(${e++}) var textureSampler${r+1}: sampler;`)}return t.join(`
`)}function ie(n){const t=[];if(n===1)t.push("outColor = textureSampleGrad(textureSource1, textureSampler1, vUV, uvDx, uvDy);");else{t.push("switch vTextureId {");for(let e=0;e<n;e++)e===n-1?t.push("  default:{"):t.push(`  case ${e}:{`),t.push(`      outColor = textureSampleGrad(textureSource${e+1}, textureSampler${e+1}, vUV, uvDx, uvDy);`),t.push("      break;}");t.push("}")}return t.join(`
`)}function se(n){return R[n]||(R[n]={name:"texture-batch-bit",vertex:{header:`
                @in aTextureIdAndRound: vec2<u32>;
                @out @interpolate(flat) vTextureId : u32;
            `,main:`
                vTextureId = aTextureIdAndRound.y;
            `,end:`
                if(aTextureIdAndRound.x == 1)
                {
                    vPosition = vec4<f32>(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw);
                }
            `},fragment:{header:`
                @in @interpolate(flat) vTextureId: u32;

                ${ne(n)}
            `,main:`
                var uvDx = dpdx(vUV);
                var uvDy = dpdy(vUV);

                ${ie(n)}
            `}}),R[n]}const k={};function ae(n){const t=[];for(let e=0;e<n;e++)e>0&&t.push("else"),e<n-1&&t.push(`if(vTextureId < ${e}.5)`),t.push("{"),t.push(`	outColor = texture(uTextures[${e}], vUV);`),t.push("}");return t.join(`
`)}function oe(n){return k[n]||(k[n]={name:"texture-batch-bit",vertex:{header:`
                in vec2 aTextureIdAndRound;
                out float vTextureId;

            `,main:`
                vTextureId = aTextureIdAndRound.y;
            `,end:`
                if(aTextureIdAndRound.x == 1.)
                {
                    gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
                }
            `},fragment:{header:`
                in float vTextureId;

                uniform sampler2D uTextures[${n}];

            `,main:`

                ${ae(n)}
            `}}),k[n]}const ue={name:"round-pixels-bit",vertex:{header:`
            fn roundPixels(position: vec2<f32>, targetSize: vec2<f32>) -> vec2<f32>
            {
                return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0;
            }
        `}},le={name:"round-pixels-bit",vertex:{header:`
            vec2 roundPixels(vec2 position, vec2 targetSize)
            {
                return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0;
            }
        `}},L={};function ce(n){let t=L[n];if(t)return t;const e=new Int32Array(n);for(let r=0;r<n;r++)e[r]=r;return t=L[n]=new _t({uTextures:{value:e,type:"i32",size:n}},{isStatic:!0}),t}class Y extends bt{constructor(t){const e=te({name:"batch",bits:[re,oe(t),le]}),r=Zt({name:"batch",bits:[ee,se(t),ue]});super({glProgram:e,gpuProgram:r,resources:{batchSamplers:ce(t)}}),this.maxTextures=t}}let A=null;const ut=class lt extends Mt{constructor(t){super(t),this.geometry=new Dt,this.name=lt.extension.name,this.vertexSize=6,A??(A=new Y(t.maxTextures)),this.shader=A}packAttributes(t,e,r,i,s){const u=s<<16|t.roundPixels&65535,o=t.transform,l=o.a,h=o.b,m=o.c,d=o.d,f=o.tx,g=o.ty,{positions:p,uvs:b}=t,v=t.color,a=t.attributeOffset,S=a+t.attributeSize;for(let c=a;c<S;c++){const x=c*2,_=p[x],G=p[x+1];e[i++]=l*_+m*G+f,e[i++]=d*G+h*_+g,e[i++]=b[x],e[i++]=b[x+1],r[i++]=v,r[i++]=u}}packQuadAttributes(t,e,r,i,s){const u=t.texture,o=t.transform,l=o.a,h=o.b,m=o.c,d=o.d,f=o.tx,g=o.ty,p=t.bounds,b=p.maxX,v=p.minX,a=p.maxY,S=p.minY,c=u.uvs,x=t.color,_=s<<16|t.roundPixels&65535;e[i+0]=l*v+m*S+f,e[i+1]=d*S+h*v+g,e[i+2]=c.x0,e[i+3]=c.y0,r[i+4]=x,r[i+5]=_,e[i+6]=l*b+m*S+f,e[i+7]=d*S+h*b+g,e[i+8]=c.x1,e[i+9]=c.y1,r[i+10]=x,r[i+11]=_,e[i+12]=l*b+m*a+f,e[i+13]=d*a+h*b+g,e[i+14]=c.x2,e[i+15]=c.y2,r[i+16]=x,r[i+17]=_,e[i+18]=l*v+m*a+f,e[i+19]=d*a+h*v+g,e[i+20]=c.x3,e[i+21]=c.y3,r[i+22]=x,r[i+23]=_}_updateMaxTextures(t){this.shader.maxTextures!==t&&(A=new Y(t),this.shader=A)}destroy(){this.shader=null,super.destroy()}};ut.extension={type:[T.Batcher],name:"default"};let fe=ut;class me{constructor(t){this.items=Object.create(null);const{renderer:e,type:r,onUnload:i,priority:s,name:u}=t;this._renderer=e,e.gc.addResourceHash(this,"items",r,s??0),this._onUnload=i,this.name=u}add(t){return this.items[t.uid]?!1:(this.items[t.uid]=t,t.once("unload",this.remove,this),t._gcLastUsed=this._renderer.gc.now,!0)}remove(t,...e){if(!this.items[t.uid])return;const r=t._gpuData[this._renderer.uid];r&&(this._onUnload?.(t,...e),t.off("unload",this.remove,this),r.destroy(),t._gpuData[this._renderer.uid]=null,this.items[t.uid]=null)}removeAll(...t){Object.values(this.items).forEach(e=>e&&this.remove(e,...t))}destroy(...t){this.removeAll(...t),this.items=Object.create(null),this._renderer=null,this._onUnload=null}}function pe(n,t,e){const r=(n>>24&255)/255;t[e++]=(n&255)/255*r,t[e++]=(n>>8&255)/255*r,t[e++]=(n>>16&255)/255*r,t[e++]=r}class xe{constructor(){this.batcherName="default",this.topology="triangle-list",this.attributeSize=4,this.indexSize=6,this.packAsQuad=!0,this.roundPixels=0,this._attributeStart=0,this._batcher=null,this._batch=null}get blendMode(){return this.renderable.groupBlendMode}get color(){return this.renderable.groupColorAlpha}reset(){this.renderable=null,this.texture=null,this._batcher=null,this._batch=null,this.bounds=null}destroy(){this.reset()}}export{de as A,xe as B,tt as C,fe as D,me as G,At as R,Tt as S,nt as V,wt as a,Zt as b,pe as c,ee as d,Ut as e,$ as f,se as g,te as h,re as i,le as j,oe as k,ce as l,Bt as m,ue as r,St as u};
