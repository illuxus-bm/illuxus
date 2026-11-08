/* esm.sh - is-buffer@1.1.6 */
var l=Object.create;var c=Object.defineProperty;var p=Object.getOwnPropertyDescriptor;var a=Object.getOwnPropertyNames;var B=Object.getPrototypeOf,m=Object.prototype.hasOwnProperty;var d=(t,f)=>()=>(f||t((f={exports:{}}).exports,f),f.exports);var y=(t,f,r,e)=>{if(f&&typeof f=="object"||typeof f=="function")for(let u of a(f))!m.call(t,u)&&u!==r&&c(t,u,{get:()=>f[u],enumerable:!(e=p(f,u))||e.enumerable});return t};var x=(t,f,r)=>(r=t!=null?l(B(t)):{},y(f||!t||!t.__esModule?c(r,"default",{value:t,enumerable:!0}):r,t));var o=d((F,s)=>{s.exports=function(t){return t!=null&&(i(t)||w(t)||!!t._isBuffer)};function i(t){return!!t.constructor&&typeof t.constructor.isBuffer=="function"&&t.constructor.isBuffer(t)}function w(t){return typeof t.readFloatLE=="function"&&typeof t.slice=="function"&&i(t.slice(0,0))}});var n=x(o()),L=n.default??n;export{L as default};
/*! Bundled license information:

is-buffer/index.js:
  (*!
   * Determine if an object is a Buffer
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)
*/
//# sourceMappingURL=is-buffer.mjs.map