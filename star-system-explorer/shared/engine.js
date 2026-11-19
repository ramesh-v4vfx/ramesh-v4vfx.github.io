/* Star System Explorer — shared 3D system viewer (Three.js r128)
 * A system page loads this file and a system JSON in the Star System Creator preset format:
 *   <body data-json="system.json"> ... <script src="../shared/engine.js"></script>
 * An inline <script type="application/json" id="system-json"> is used instead if present (works from file://).
 * Same maths as the creator: sky-plane reference frame, Kepler motion, flux-based habitable zone (0.53-1.1 x Earth).
 *
 * Search for these section markers to find things quickly:
 *   ===== SURFACE BAR =====     exit button, speed slider and planet-to-planet buttons in surface view
 *   ===== SURFACE TERRAIN =====  the ground shader (latitude moves you to different ground)
 *   ===== SURFACE VIEW =====     enter / exit / per-frame update (planets) and the star hover view (enterStarView)
 */
(function(){
'use strict';
var $ = function(s, r){ return (r || document).querySelector(s); };
var D2R = Math.PI/180, TAU = Math.PI*2;
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

var TYPES = {
  rocky:       { label:'Rocky',        alb:0.30, hex:0x8a7a63 },
  superearth:  { label:'Super-Earth',  alb:0.30, hex:0x9c8468 },
  minineptune: { label:'Mini-Neptune', alb:0.50, hex:0xb8dce8 },
  ice:         { label:'Ice giant',    alb:0.60, hex:0x9fd6e8 },
  gas:         { label:'Gas giant',    alb:0.50, hex:0xe8c98a },
  dwarf:       { label:'Dwarf planet', alb:0.15, hex:0x8a8a8a }
};
var HZ_LO = 0.53, HZ_HI = 1.1;          // stellar flux limits (Earth = 1), same as the creator
var MERCURY_AU = 0.387;

function tempToRGB(T){
  var tt = T/100, r, g, b;
  if (tt <= 66){ r = 255; g = 99.47*Math.log(tt) - 161.12; }
  else { r = 329.7*Math.pow(tt - 60, -0.1332); g = 288.12*Math.pow(tt - 60, -0.0755); }
  if (tt >= 66) b = 255; else if (tt <= 19) b = 0; else b = 138.52*Math.log(tt - 10) - 305.04;
  return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255)];
}
function starColor(s){ var c = tempToRGB(s.T); return new THREE.Color(c[0]/255, c[1]/255, c[2]/255); }
function starLum(s){ return s.cls === 'BH' ? 0 : s.R*s.R*Math.pow(s.T/5778, 4); }

/* ---------- Kepler maths (same as creator) ---------- */
function orientCoef(o){
  var i = (o.inc||0)*D2R, O = (o.node||0)*D2R, w = (o.argp||0)*D2R;
  var cO = Math.cos(O), sO = Math.sin(O), cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(i), si = Math.sin(i);
  return { xx: cO*cw - sO*sw*ci, xy: -(cO*sw + sO*cw*ci), yx: sO*cw + cO*sw*ci, yy: -(sO*sw - cO*cw*ci), zx: sw*si, zy: cw*si };
}
function orient(c, xp, yp, out){ out.x = c.xx*xp + c.xy*yp; out.z = c.yx*xp + c.yy*yp; out.y = c.zx*xp + c.zy*yp; return out; }
function orbitNormal(o){
  var c = orientCoef(o);
  return new THREE.Vector3(c.xx, c.zx, c.yx).cross(new THREE.Vector3(c.xy, c.zy, c.yy)).normalize();
}
function solveKepler(M, e){ var E = M; for (var i = 0; i < 10; i++) E -= (E - e*Math.sin(E) - M)/(1 - e*Math.cos(E)); return E; }

/* ---------- procedural textures ---------- */
function rng(seed){ var s = seed >>> 0; return function(){ s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s/4294967296; }; }
function planetTexture(typeId, hex, seed, k){
  k = k || 1;
  var rnd = rng(seed*7919 + 13), c = document.createElement('canvas'); c.width = 256*k; c.height = 128*k;
  var g = c.getContext('2d'); g.scale(k, k); var base = new THREE.Color(hex);
  var br = Math.round(base.r*255), bg = Math.round(base.g*255), bb = Math.round(base.b*255), i;
  g.fillStyle = 'rgb(' + br + ',' + bg + ',' + bb + ')'; g.fillRect(0, 0, 256, 128);
  // an equirectangular map is stretched sideways near the poles, so features are drawn wider there (they look round on the sphere) and wrapped round the seam
  function blob(x, y, rx, ry, stroke){
    var cl = Math.max(0.18, Math.cos((y/128 - 0.5)*Math.PI)), w = Math.min(rx/cl, 120);
    for (var o = -256; o <= 256; o += 256){
      if (x + o + w < 0 || x + o - w > 256) continue;
      g.beginPath(); g.ellipse(x + o, y, w, ry, 0, 0, TAU); if (stroke) g.stroke(); else g.fill();
    }
  }
  if (typeId === 'gas' || typeId === 'ice' || typeId === 'minineptune'){
    for (i = 0; i < 9; i++){
      var sh = 0.75 + rnd()*0.5;
      g.fillStyle = 'rgba(' + Math.round(br*sh) + ',' + Math.round(bg*sh) + ',' + Math.round(bb*sh) + ',0.55)';
      g.fillRect(0, i*128/9, 256, 128/9);
    }
    for (i = 0; i < 18; i++){ g.fillStyle = 'rgba(255,255,255,0.08)'; blob(rnd()*256, rnd()*128, 20 + rnd()*50, 3 + rnd()*6, false); }
  } else {
    for (i = 0; i < 70; i++){
      var s2 = 0.65 + rnd()*0.6;
      g.fillStyle = 'rgba(' + Math.round(br*s2) + ',' + Math.round(bg*s2) + ',' + Math.round(bb*s2) + ',0.5)';
      var bx = rnd()*256, by = rnd()*128, br2 = 4 + rnd()*14; blob(bx, by, br2, br2, false);
    }
    if (typeId === 'dwarf' || typeId === 'superearth'){
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
      for (i = 0; i < 20; i++){ var cx0 = rnd()*256, cy0 = rnd()*128, cr0 = 2 + rnd()*5; blob(cx0, cy0, cr0, cr0, true); }
    }
  }
  var t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function ringTexture(hex, seed){
  var rnd = rng(seed*31 + 5), c = document.createElement('canvas'); c.width = 16; c.height = 256;
  var g = c.getContext('2d'), b = new THREE.Color(hex);
  for (var y = 0; y < 256; y++){ g.fillStyle = 'rgba(' + Math.round(b.r*255) + ',' + Math.round(b.g*255) + ',' + Math.round(b.b*255) + ',' + (0.15 + rnd()*0.45) + ')'; g.fillRect(0, y, 16, 1); }
  return new THREE.CanvasTexture(c);
}
function fixRingUVs(geo, ri, ro){
  var pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (var i = 0; i < pos.count; i++){
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (Math.atan2(v.y, v.x) + Math.PI)/TAU, (Math.sqrt(v.x*v.x + v.y*v.y) - ri)/(ro - ri));
  }
  uv.needsUpdate = true;
}
function glowTexture(stops){
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(function(s){ gr.addColorStop(s[0], 'rgba(255,255,255,' + s[1] + ')'); });
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* granulated star surface: worley cells -> grey texture, coloured and animated in the shader */
function hash3(x, y, z, s){
  var h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(s, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0)/4294967296;
}
function vnoise(x, y, z, s){
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx*fx*(3 - 2*fx); fy = fy*fy*(3 - 2*fy); fz = fz*fz*(3 - 2*fz);
  var a = hash3(xi, yi, zi, s), b = hash3(xi+1, yi, zi, s), c = hash3(xi, yi+1, zi, s), d = hash3(xi+1, yi+1, zi, s),
      e = hash3(xi, yi, zi+1, s), f = hash3(xi+1, yi, zi+1, s), g = hash3(xi, yi+1, zi+1, s), h = hash3(xi+1, yi+1, zi+1, s);
  var x1 = a + (b - a)*fx, x2 = c + (d - c)*fx, x3 = e + (f - e)*fx, x4 = g + (h - g)*fx, y1 = x1 + (x2 - x1)*fy, y2 = x3 + (x4 - x3)*fy;
  return y1 + (y2 - y1)*fz;
}
var cell = { f1:0, f2:0, id:0 };
function worley(x, y, z, s){
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), f1 = 9, f2 = 9, id = 0;
  for (var k = -1; k <= 1; k++) for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++){
    var cx = xi + i, cy = yi + j, cz = zi + k;
    var dx = cx + hash3(cx, cy, cz, s) - x, dy = cy + hash3(cx, cy, cz, s + 1) - y, dz = cz + hash3(cx, cy, cz, s + 2) - z, d = dx*dx + dy*dy + dz*dz;
    if (d < f1){ f2 = f1; f1 = d; id = hash3(cx, cy, cz, s + 3); } else if (d < f2) f2 = d;
  }
  cell.f1 = Math.sqrt(f1); cell.f2 = Math.sqrt(f2); cell.id = id;
}
function sm01(a, b, x){ var t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); }
var starTex = null;
function starTexture(){
  if (starTex) return starTex;
  var W = 512, H = 256, seed = 1, c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d'), img = g.createImageData(W, H), px = img.data, o = 0;
  for (var y = 0; y < H; y++){
    var lat = (0.5 - (y + 0.5)/H)*Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (var x = 0; x < W; x++){
      var lon = ((x + 0.5)/W)*TAU, nx = cl*Math.cos(lon), ny = sl, nz = cl*Math.sin(lon);
      worley(nx*18 + seed*13.7, ny*18 + seed*5.1, nz*18 + seed*9.3, seed*7);
      var lane = sm01(0, 0.95, cell.f2 - cell.f1), core = 1 - Math.min(1, cell.f1*1.3), gran = Math.pow(lane, 0.8)*(0.4 + 0.6*core);
      var cv = (0.96 + 0.08*cell.id)*(0.94 + 0.12*vnoise(nx*44 + seed, ny*44, nz*44, seed + 21));
      var mott = 0.5*vnoise(nx*4 + seed, ny*4, nz*4, seed + 11) + 0.3*vnoise(nx*9, ny*9 + seed, nz*9, seed + 12) + 0.2*vnoise(nx*18, ny*18, nz*18 + seed, seed + 13);
      var v = Math.min(255, 255*(0.68 + 0.32*gran)*cv*(0.9 + 0.2*mott)*1.4);
      px[o++] = v; px[o++] = v; px[o++] = v; px[o++] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  starTex = new THREE.CanvasTexture(c); starTex.wrapS = starTex.wrapT = THREE.RepeatWrapping; starTex.anisotropy = 4;
  return starTex;
}
function starMaterial(col){
  return new THREE.ShaderMaterial({
    uniforms:{ map:{ value:starTexture() }, tint:{ value:col }, time:{ value:0 } },
    vertexShader:'varying vec2 vUv; varying vec3 vN; varying vec3 vV;\nvoid main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }',
    fragmentShader:'uniform sampler2D map; uniform vec3 tint; uniform float time; varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
      'void main(){ float L=texture2D(map,vUv).r; float fl=texture2D(map,vUv*3.0+vec2(time*0.004,time*0.0025)).r;\n' +
      ' L*=1.0+0.16*(fl-0.5)*sin(time*1.1+fl*18.0); vec3 c=tint*L*1.3; c=mix(c,vec3(1.0),smoothstep(0.75,1.1,L)*0.5);\n' +
      ' float mu=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0); c*=(1.0-0.45*(1.0-mu))*vec3(1.0,mix(0.9,1.0,mu),mix(0.78,1.0,mu)); c+=tint*pow(1.0-mu,5.0)*0.4; gl_FragColor=vec4(c,1.0); }'
  });
}
function hzRingMaterial(rIn, rOut){
  // habitable-zone band: a very faint green wash that fades out softly at both edges (no hard ring line)
  return new THREE.ShaderMaterial({
    uniforms:{ col:{ value:new THREE.Color(0x39d98a) }, rIn:{ value:rIn }, rOut:{ value:rOut }, k:{ value:0.05 } },
    transparent:true, side:THREE.DoubleSide, depthWrite:false,
    vertexShader:'varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:'uniform vec3 col; uniform float rIn; uniform float rOut; uniform float k; varying float vR;\n' +
      'void main(){ float t = (vR - rIn)/max(rOut - rIn, 1e-6); float a = smoothstep(0.0, 0.4, t)*smoothstep(1.0, 0.6, t); gl_FragColor = vec4(col, a*k); }'
  });
}
function atmosphereMaterial(col){
  // a thin shell just above the surface: bright only at the limb, fading smoothly outward,
  // strong on the side facing the star and almost gone on the night side (no flat halo)
  return new THREE.ShaderMaterial({
    uniforms:{ tint:{ value:col }, sun:{ value:new THREE.Vector3(1, 0, 0) } }, transparent:true, side:THREE.FrontSide, blending:THREE.AdditiveBlending, depthWrite:false,
    vertexShader:'varying vec3 vN; varying vec3 vV; varying vec3 vWN; void main(){ vN=normalize(normalMatrix*normal); vWN=normalize(mat3(modelMatrix)*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }',
    fragmentShader:'uniform vec3 tint; uniform vec3 sun; varying vec3 vN; varying vec3 vV; varying vec3 vWN;\n' +
      'void main(){ float mu=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);\n' +
      ' float rim=pow(1.0-mu,3.0)*smoothstep(0.0,0.3,mu);\n' +
      ' float ndl=dot(normalize(vWN),normalize(sun)); float lit=smoothstep(-0.3,0.55,ndl);\n' +
      ' vec3 c=mix(tint,vec3(1.0,0.62,0.42),smoothstep(0.35,-0.05,ndl)*0.4);\n' +
      ' gl_FragColor=vec4(c*rim*(0.04+lit)*1.2,1.0); }'
  });
}

  // ================= SMOOTH PROCEDURAL PLANET / MOON SURFACES =================
  // The old planet "texture" was a small 256x128 canvas painted with random circles: hard edges, a visible seam,
  // and it was re-rolled on every edit. Now the surface is computed per pixel on the GPU from 3D noise on the
  // sphere, so it is seamless, stays sharp at any zoom, and is always the same for a given planet name + type.
  // It plugs into the normal lit material (onBeforeCompile), so the star lighting is unchanged.
  var Y_AXIS = new THREE.Vector3(0, 1, 0);
  var X_AXIS = new THREE.Vector3(1, 0, 0);
  var Z_AXIS = new THREE.Vector3(0, 0, 1);
  var _spinQ = new THREE.Quaternion();
  var _frameTmp = new THREE.Quaternion();
  var _identityQ = new THREE.Quaternion();
  var _fe1 = new THREE.Vector3(), _fup = new THREE.Vector3(), _fe2 = new THREE.Vector3();

  var BODY_KIND = { rocky:0, superearth:1, minineptune:2, ice:3, gas:4, dwarf:5, icy:6, volcanic:7 };
  function strHash(s){
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  var BODY_GLSL = [
    'uniform float uKind; uniform vec3 uBase; uniform vec3 uSeed;',
    'varying vec3 vBodyPos;',
    'float bHash(vec3 p){ p = 50.0*fract(p*0.3183099 + vec3(0.71,0.113,0.419)); return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
    'float bNoise(vec3 x){',
    '  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0 - 2.0*f);',
    '  return mix(mix(mix(bHash(i), bHash(i+vec3(1.0,0.0,0.0)), f.x), mix(bHash(i+vec3(0.0,1.0,0.0)), bHash(i+vec3(1.0,1.0,0.0)), f.x), f.y),',
    '             mix(mix(bHash(i+vec3(0.0,0.0,1.0)), bHash(i+vec3(1.0,0.0,1.0)), f.x), mix(bHash(i+vec3(0.0,1.0,1.0)), bHash(i+vec3(1.0,1.0,1.0)), f.x), f.y), f.z);',
    '}',
    'float bFbm(vec3 p){ float a = 0.5; float s = 0.0; for (int i=0;i<6;i++){ s += a*bNoise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; } return s*1.03; }',
    // nearest-feature distance (x) and a per-cell random id (y), used for craters, pits and calderas
    'vec2 bCell(vec3 p){',
    '  vec3 i = floor(p); vec3 f = fract(p); float d1 = 9.0; vec3 best = i;',
    '  for (int z=-1; z<=1; z++){ for (int y=-1; y<=1; y++){ for (int x=-1; x<=1; x++){',
    '    vec3 g = vec3(float(x), float(y), float(z)); vec3 c = i + g;',
    '    vec3 o = vec3(bHash(c), bHash(c+17.0), bHash(c+43.0));',
    '    vec3 r = g + o - f; float d = dot(r, r);',
    '    if (d < d1){ d1 = d; best = c; }',
    '  } } }',
    '  return vec2(sqrt(d1), bHash(best + 71.0));',
    '}',
    // crater shading: dark floor, bright rim (0 where there is no crater)
    'float bCrater(vec3 p, float freq){',
    '  vec2 c = bCell(p*freq);',
    '  float has = step(0.42, fract(c.y*13.7));',
    '  float rad = 0.16 + 0.3*fract(c.y*5.3);',
    '  float d = c.x/rad;',
    '  float fl = smoothstep(1.0, 0.35, d);',
    '  float rim = exp(-pow((d - 1.05)/0.2, 2.0));',
    '  return has*(rim*0.42 - fl*0.45);',
    '}',
    'vec3 bodyAlbedo(vec3 n){',
    '  vec3 p = n + uSeed;',
    '  vec3 base = uBase; float k = uKind; vec3 col;',
    '  if (k < 1.5){',
    // ROCKY (0) and SUPER-EARTH (1): terrain tones, grain, craters
    '    float sup = k;',
    '    float h = bFbm(p*2.2);',
    '    float ridge = 1.0 - abs(2.0*bNoise(p*3.5 + 5.0) - 1.0);',
    '    float terr = mix(h, ridge*0.8 + h*0.3, 0.3 + 0.3*sup);',
    '    vec3 lo = base*vec3(0.55,0.5,0.46); vec3 hi = base*vec3(1.35,1.28,1.2);',
    '    col = mix(lo, base, smoothstep(0.25, 0.5, terr));',
    '    col = mix(col, hi, smoothstep(0.55, 0.85, terr));',
    '    col *= 0.9 + 0.2*bNoise(p*60.0) + 0.08*(bNoise(p*170.0) - 0.5);',
    '    float cr = bCrater(p, 6.0)*0.8 + bCrater(p, 17.0)*0.6 + bCrater(p, 48.0)*0.4;',
    '    col *= 1.0 + cr*(0.65 - 0.3*sup);',
    '  } else if (k < 3.5){',
    // MINI-NEPTUNE (2) and ICE GIANT (3): soft bands and haze
    '    float lat = n.y;',
    '    float warp = bFbm(vec3(n.x*3.0, n.y*1.5, n.z*3.0) + uSeed)*0.9;',
    '    float fr = (k < 2.5) ? 9.0 : 13.0;',
    '    float b = 0.5 + 0.5*sin((lat + warp*0.35)*fr + bFbm(p*4.0)*2.0);',
    '    vec3 a = base*vec3(0.78,0.86,0.95); vec3 c = base*vec3(1.12,1.1,1.05);',
    '    col = mix(a, c, b);',
    '    float w = bNoise(vec3(n.x*2.0, n.y*14.0, n.z*2.0) + uSeed*3.0);',
    '    col = mix(col, vec3(1.0), smoothstep(0.62, 0.9, w)*0.18);',
    '  } else if (k < 4.5){',
    // GAS GIANT (4): strong belts, streaks and a storm
    '    float lat = n.y;',
    '    vec3 q = vec3(n.x*2.4, lat*3.0, n.z*2.4) + uSeed;',
    '    float turb = bFbm(q*2.0 + vec3(0.0, bFbm(q*4.0)*1.5, 0.0));',
    '    float bands = 0.5 + 0.5*sin(lat*22.0 + turb*5.0 + sin(lat*7.0)*1.5);',
    '    float streak = bNoise(vec3(n.x*5.0, lat*70.0, n.z*5.0) + uSeed*2.0);',
    '    vec3 dark = base*vec3(0.62,0.5,0.4); vec3 light = base*vec3(1.2,1.15,1.05);',
    '    col = mix(dark, light, bands*0.8 + streak*0.2);',
    '    float lon = atan(n.z, n.x);',
    '    float sl = fract(uSeed.x*0.137)*6.2831853;',
    '    float dl = lon - sl; dl = atan(sin(dl), cos(dl));',
    '    float dy = lat + 0.32;',
    '    float e = (dl*dl)/(0.3*0.3) + (dy*dy)/(0.11*0.11);',
    '    float spot = smoothstep(1.0, 0.25, e);',
    '    float swirl = 0.5 + 0.5*sin(atan(dy, dl*0.4)*3.0 + sqrt(e)*6.0);',
    '    col = mix(col, base*vec3(1.1,0.55,0.4)*(0.8 + 0.4*swirl), spot*0.75);',
    '  } else if (k < 5.5){',
    // DWARF (5): grey regolith, many craters
    '    float h = bFbm(p*3.0);',
    '    col = base*(0.6 + 0.7*h)*(0.9 + 0.2*bNoise(p*90.0));',
    '    float cr = bCrater(p, 5.0) + bCrater(p, 14.0)*0.8 + bCrater(p, 40.0)*0.7 + bCrater(p, 110.0)*0.5;',
    '    col *= 1.0 + cr*0.75;',
    '  } else if (k < 6.5){',
    // ICY MOON (6): pale ice, thin cracks, bright craters
    '    float f = bFbm(p*3.0);',
    '    vec3 a = base*vec3(0.78,0.88,1.0); vec3 b2 = base*vec3(1.05,1.05,1.05);',
    '    col = mix(a, b2, smoothstep(0.3, 0.7, f));',
    '    float crack = 1.0 - smoothstep(0.0, 0.03, abs(bNoise(p*7.0 + bNoise(p*3.0)*2.0) - 0.5));',
    '    col = mix(col, base*vec3(0.55,0.5,0.45), crack*0.55);',
    '    col *= 1.0 + bCrater(p, 8.0)*0.7 + bCrater(p, 26.0)*0.5;',
    '    col *= 0.92 + 0.16*bNoise(p*70.0);',
    '  } else {',
    // VOLCANIC MOON (7): sulfur plains and dark calderas
    '    float b = bFbm(p*3.0);',
    '    vec3 yel = base*vec3(1.0,0.95,0.6); vec3 org = base*vec3(1.0,0.55,0.25)*0.9;',
    '    col = mix(yel, org, smoothstep(0.4, 0.65, b));',
    '    col = mix(col, vec3(0.95,0.93,0.85), smoothstep(0.62, 0.78, bFbm(p*5.0 + 9.0))*0.7);',
    '    float pit = bCell(p*14.0).x;',
    '    col = mix(col, vec3(0.12,0.08,0.06), smoothstep(0.17, 0.08, pit)*0.9);',
    '    col *= 0.9 + 0.2*bNoise(p*80.0);',
    '  }',
    '  return clamp(col, 0.0, 1.0);',
    '}'
  ].join('\n');

  function makeBodyMaterial(typeId, hexNum, seedKey, rough, metal){
    var h = strHash(String(seedKey) + '|' + typeId);
    var uni = {
      uKind: { value: BODY_KIND[typeId] !== undefined ? BODY_KIND[typeId] : 0 },
      uBase: { value: new THREE.Color(hexNum) },
      uSeed: { value: new THREE.Vector3(((h & 1023)/1023)*30, (((h >>> 10) & 1023)/1023)*30, (((h >>> 20) & 1023)/1023)*30) }
    };
    var mat = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:rough, metalness:metal });
    mat.onBeforeCompile = function(sh){
      sh.uniforms.uKind = uni.uKind; sh.uniforms.uBase = uni.uBase; sh.uniforms.uSeed = uni.uSeed;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBodyPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBodyPos = normalize(position);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + BODY_GLSL)
        .replace('#include <map_fragment>', 'diffuseColor.rgb = bodyAlbedo(normalize(vBodyPos));');
    };
    mat.customProgramCacheKey = function(){ return 'rv-body-v1'; };
    mat.userData.seed = h;
    return mat;
  }
  function bodyRoughness(typeId){ return (typeId === 'gas' || typeId === 'ice' || typeId === 'minineptune') ? 0.9 : (typeId === 'icy' ? 0.55 : 0.82); }


/* ---------- loading ---------- */
function loadJSON(){
  var inline = $('#system-json');
  if (inline) return Promise.resolve(JSON.parse(inline.textContent));
  var url = document.body.getAttribute('data-json') || 'system.json';
  return fetch(url).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url); return r.json(); });
}
function fail(msg){
  var el = $('#loading'); if (!el) return;
  el.classList.add('err'); el.innerHTML = '<b>COULD NOT LOAD SYSTEM DATA</b><span>' + esc(msg) + '</span>';
}
if (typeof THREE === 'undefined'){ document.addEventListener('DOMContentLoaded', function(){ fail('3D library failed to load. Check your connection and reload.'); }); return; }
function start(){ loadJSON().then(init).catch(function(e){ console.error(e); fail(String(e && e.message || e) + (location.protocol === 'file:' ? ' — open this page through a web server, browsers block local file loading.' : '')); }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

/* ---------- the viewer ---------- */
function init(S){
  var EPOCH = S.epoch || 2000;
  var stars = (S.stars || []).map(function(s, i){
    return { name:s.name || ('Star ' + (i + 1)), cls:s.cls || '', M:+s.M || 1, R:+s.R || 1, T:+s.T || 5778, au:+s.au || 0, ecc:+s.ecc || 0, angle:+s.angle || 0, inc:s.inc, node:s.node, argp:s.argp, tp:s.tp };
  });
  if (!stars.length) throw new Error('No stars in system file');
  var totalM = stars.reduce(function(a, s){ return a + s.M; }, 0);
  var totalL = stars.reduce(function(a, s){ return a + starLum(s); }, 0);
  stars.forEach(function(s){ s.L = starLum(s); s.col = starColor(s); });

  var planets = (S.planets || []).map(function(p, i){
    var tid = TYPES[p.typeId] ? p.typeId : 'rocky';
    var o = { name:p.name || ('Planet ' + (i + 1)), au:+p.au || 0.1, ecc:+p.ecc || 0, type:tid, radiusRE:+p.radiusRE || 1, massME:+p.massME || 1, angle:+p.angle || 0,
      hasRing:!!p.hasRing, si:clamp(p.starIndex || 0, 0, stars.length - 1), inc:p.inc, node:p.node, argp:p.argp, tp:p.tp, idx:i };
    o.circum = stars.length > 1 && o.si === 0 && o.au > 3*stars[1].au;               // far outside a close pair: orbits the pair's centre
    var hostM = o.circum || stars.length === 1 ? totalM : stars[o.si].M;
    o.P = Math.sqrt(Math.pow(o.au, 3)/Math.max(hostM, 1e-4));                           // years
    var hostL = o.circum ? totalL : stars[o.si].L;
    o.flux = hostL/(o.au*o.au);
    o.teq = 278.5*Math.pow(hostL, 0.25)*Math.pow(1 - TYPES[tid].alb, 0.25)/Math.sqrt(o.au);
    o.hz = o.flux >= HZ_LO && o.flux <= HZ_HI;
    o.hex = TYPES[tid].hex;
    return o;
  });
  var aMin = planets.length ? Math.min.apply(null, planets.map(function(p){ return p.au; })) : 0.1;
  var aMax = planets.length ? Math.max.apply(null, planets.map(function(p){ return p.au; })) : 1;
  var Pmin = planets.length ? Math.min.apply(null, planets.map(function(p){ return p.P; })) : 1;
  var hz = totalL > 0 ? { lo:Math.sqrt(totalL/HZ_HI), hi:Math.sqrt(totalL/HZ_LO) } : null;

  /* ---- scale ---- */
  var scaleMode = 'true';                          // 'true': real distances and real body sizes. 'log': stylized spread, enlarged bodies
  var AU_PER_RSUN = 0.00465047, AU_PER_REARTH = 4.26352e-5, KU = 6.5/aMax;   // KU = scene units per AU in true mode
  function rad(a){
    if (scaleMode === 'true') return a*KU;
    if (aMax/aMin < 1.05) return 4;
    return Math.max(0.45, 1.4 + 5.6*(Math.log(a) - Math.log(aMin))/(Math.log(aMax) - Math.log(aMin)));
  }
  function starSep(au){ return scaleMode === 'true' ? au*KU : Math.max(0.6, au*6.5/aMax); }
  function starSize(s){ return scaleMode === 'true' ? Math.max(1e-7, s.R*AU_PER_RSUN*KU) : clamp(0.34*Math.pow(s.R, 0.33), 0.1, 0.85); }
  function planetSize(p){ return scaleMode === 'true' ? Math.max(1e-8, p.radiusRE*AU_PER_REARTH*KU) : 0.05 + 0.055*Math.sqrt(p.radiusRE); }

  /* ---- three.js scene ---- */
  var viewer = $('#viewer'), cv = $('#gl');
  var renderer = new THREE.WebGLRenderer({ canvas:cv, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.001, 1600);
  var sysGroup = new THREE.Group(); scene.add(sysGroup);
  var overlay = new THREE.Group(); scene.add(overlay);

  // background: a nebula / Milky Way sky baked once into a texture (cheap to draw), plus twinkling stars of different sizes
  var sky = new THREE.Group(); scene.add(sky);
  var skyStarMat = null;
  (function(){
    // 1) bake the nebula with a one-off full-screen shader into a render target
    var W = 2048, H = 1024, rt = new THREE.WebGLRenderTarget(W, H, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat });
    var bgScene = new THREE.Scene(), bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader:
        'varying vec2 vUv;\n' +
        'float h(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }\n' +
        'float n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);\n' +
        '  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),\n' +
        '             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }\n' +
        'float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a*n(p); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }\n' +
        'void main(){\n' +
        '  float lon = vUv.x*6.2831853, lat = (vUv.y - 0.5)*3.14159265;\n' +
        '  vec3 d = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));\n' +
        '  float band = exp(-pow(dot(d, normalize(vec3(0.25, 0.85, 0.45)))*3.0, 2.0));\n' +
        '  float c1 = fbm(d*2.1), c2 = fbm(d*4.6 + 3.0), c3 = fbm(d*9.0 + 7.0);\n' +
        '  vec3 col = vec3(0.0);\n' +
        '  gl_FragColor = vec4(col, 1.0);\n' +
        '}'
    })));
    renderer.setRenderTarget(rt); renderer.render(bgScene, bgCam); renderer.setRenderTarget(null);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.MeshBasicMaterial({ map:rt.texture, side:THREE.BackSide, depthWrite:false, depthTest:false }));
    dome.renderOrder = -20; dome.rotation.y = 1.2; sky.add(dome);

    // 2) stars: many faint ones, a few bright, each with its own colour and twinkle
    var n = 9000, pos = new Float32Array(n*3), col = new Float32Array(n*3), size = new Float32Array(n), ph = new Float32Array(n), r = rng(99);
    var band = new THREE.Vector3(0.25, 0.85, 0.45).normalize();
    for (var i = 0; i < n; i++){
      var u, th, s, x, y, z;
      do { u = r()*2 - 1; th = r()*TAU; s = Math.sqrt(1 - u*u); x = s*Math.cos(th); y = u; z = s*Math.sin(th); }
      while (r() > 0.7 + 0.3*Math.exp(-Math.pow((x*band.x + y*band.y + z*band.z)*3, 2)));
      pos[i*3] = 900*x; pos[i*3 + 1] = 900*y; pos[i*3 + 2] = 900*z;
      var t = r(), k = 0.4 + r()*0.6, c = t < 0.12 ? [0.62, 0.74, 1] : (t < 0.3 ? [1, 0.86, 0.68] : (t < 0.34 ? [1, 0.6, 0.55] : [1, 1, 1]));
      col[i*3] = c[0]*k; col[i*3 + 1] = c[1]*k; col[i*3 + 2] = c[2]*k;
      size[i] = 1.1 + Math.pow(r(), 5)*4.2; ph[i] = r()*TAU;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    skyStarMat = new THREE.ShaderMaterial({
      uniforms:{ time:{ value:0 }, px:{ value:Math.min(window.devicePixelRatio || 1, 2) } }, transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending,
      vertexShader:'attribute vec3 aCol; attribute float aSize; attribute float aPh; uniform float time; uniform float px; varying vec3 vC;\n' +
        'void main(){ vC = aCol; float tw = 0.72 + 0.28*sin(time*(0.7 + aPh*0.25) + aPh*6.2831); gl_PointSize = aSize*px*tw; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
      fragmentShader:'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5)*2.0; float a = clamp(1.0 - d, 0.0, 1.0); a *= a; gl_FragColor = vec4(vC*(0.35 + 1.1*a), a); }'
    });
    var pts = new THREE.Points(g, skyStarMat); pts.renderOrder = -10; pts.frustumCulled = false; sky.add(pts);
  })();

  scene.add(new THREE.AmbientLight(0xffffff, 0.16));
  var glowTex = glowTexture([[0, 1], [0.2, 0.75], [0.5, 0.22], [1, 0]]), haloTex = glowTexture([[0, 0.55], [0.35, 0.16], [1, 0]]);

  // plane the planets orbit in -> laid flat, so the system is viewed like a classic orrery
  (function(){
    var sum = new THREE.Vector3(), ref = null, n = 0;
    planets.forEach(function(p){
      if (p.inc === null || p.inc === undefined || !isFinite(p.inc)) return;
      var v = orbitNormal(p);
      if (!ref) ref = v.clone(); else if (v.dot(ref) < 0) v.negate();
      sum.add(v); n++;
    });
    if (n && sum.lengthSq() > 1e-12) sysGroup.quaternion.setFromUnitVectors(sum.normalize(), new THREE.Vector3(0, 1, 0));
  })();

  // stars
  var starObjs = stars.map(function(s, i){
    var g = new THREE.Group(), sr = starSize(s), sprites = [];
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), starMaterial(s.col));
    mesh.scale.setScalar(sr);
    var saxis = new THREE.Group(); saxis.quaternion.copy(sysGroup.quaternion).invert(); saxis.add(mesh);   // sysGroup is turned to lay the orbits flat; undo that so the star spins about world-up, not sideways
    g.add(saxis);
    [[haloTex, 22, 0.5, 0.2], [glowTex, 9, 0.95, 0.07]].forEach(function(d){
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:d[0], color:s.col, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:d[2] }));
      sp.scale.setScalar(sr*d[1]); g.add(sp); sprites.push({ sp:sp, k:d[1], kd:d[3] });
    });
    var light = new THREE.PointLight(s.col.clone().lerp(new THREE.Color(1, 1, 1), 0.25), 1.9/Math.sqrt(stars.length), 0);
    g.add(light);
    sysGroup.add(g);
    return { g:g, mesh:mesh, size:sr, sprites:sprites };
  });
  var starPos = stars.map(function(){ return new THREE.Vector3(); });
  var tSim = 0;
  function placeStars(){
    var c = {}, rel;
    if (stars.length === 1){ return; }
    var s1 = stars[1], Pp = Math.sqrt(Math.pow(s1.au, 3)/Math.max(stars[0].M + s1.M, 1e-4));
    s1.P = Pp;
    rel = relPos(s1, starSep(s1.au), Pp);
    var m0 = stars[0].M, m1 = s1.M, t = m0 + m1;
    starPos[0].set(-rel.x*m1/t, -rel.y*m1/t, -rel.z*m1/t);
    starPos[1].set(rel.x*m0/t, rel.y*m0/t, rel.z*m0/t);
    for (var k = 2; k < stars.length; k++){
      var sk = stars[k], Pk = Math.sqrt(Math.pow(sk.au, 3)/Math.max(totalM, 1e-4)), r2 = relPos(sk, starSep(sk.au), Pk);
      starPos[k].set(r2.x, r2.y, r2.z);
    }
  }
  function phase0(o, P){
    if (typeof o.tp === 'number' && isFinite(o.tp)) return TAU*(EPOCH - o.tp)/Math.max(P, 1e-4);
    return o.angle || 0;
  }
  var tmpOut = {x:0, y:0, z:0};
  function relPos(o, aU, P, t){
    var e = o.ecc || 0, M = phase0(o, P) + TAU*(t === undefined ? tSim : t)/Math.max(P, 1e-5);
    M = ((M % TAU) + TAU) % TAU;
    var E = solveKepler(M, e), r = aU*(1 - e*Math.cos(E));
    var ta = 2*Math.atan2(Math.sqrt(1 + e)*Math.sin(E/2), Math.sqrt(1 - e)*Math.cos(E/2));
    return orient(orientCoef(o), r*Math.cos(ta), r*Math.sin(ta), tmpOut);
  }

  // planets
  var planetObjs = planets.map(function(p, i){
    var size = planetSize(p), grp = new THREE.Group();
    var mat = makeBodyMaterial(p.type, p.hex, p.name, bodyRoughness(p.type), 0);
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
    mesh.scale.setScalar(size);
    var axis = new THREE.Group(), leanA = (2 + 10*((i*0.618 + 0.3) % 1))*D2R, leanP = i*2.4;   // spin axis: world-up (the orbit normal) with a small lean of its own
    axis.quaternion.copy(sysGroup.quaternion).invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(leanP), 0, Math.sin(leanP)), leanA));
    axis.add(mesh); grp.add(axis);
    var atm = null, tilt = null;
    if (p.type !== 'rocky' && p.type !== 'dwarf' && p.type !== 'superearth'){
      atm = new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), atmosphereMaterial(new THREE.Color(p.hex).lerp(new THREE.Color(1, 1, 1), 0.3)));
      atm.scale.setScalar(size); grp.add(atm);
    }
    if (p.hasRing){
      var ri = 1.55, ro = 2.6, rg = new THREE.RingGeometry(ri, ro, 64);
      fixRingUVs(rg, ri, ro);
      var ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map:ringTexture(p.hex, i + 1), side:THREE.DoubleSide, transparent:true, depthWrite:false }));
      tilt = new THREE.Group(); ring.rotation.x = -Math.PI/2; tilt.add(ring); tilt.scale.setScalar(size); axis.add(tilt);   // rings lie in the planet's equator
    }
    sysGroup.add(grp);
    return { g:grp, mesh:mesh, atm:atm, ring:tilt, size:size, line:null, holder:new THREE.Group() };
  });

  function applySizes(){
    starObjs.forEach(function(so, i){ so.size = starSize(stars[i]); so.mesh.scale.setScalar(so.size); });
    planetObjs.forEach(function(po, i){ po.size = planetSize(planets[i]); po.mesh.scale.setScalar(po.size); if (po.atm) po.atm.scale.setScalar(po.size); if (po.ring) po.ring.scale.setScalar(po.size); });
  }
  var dotTex = (function(){ var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 11, 0, TAU); g.fill(); return new THREE.CanvasTexture(c); })();
  var markerGeo = new THREE.BufferGeometry(), markerPos = new Float32Array(Math.max(1, planets.length)*3);
  markerGeo.setAttribute('position', new THREE.BufferAttribute(markerPos, 3));
  var markers = new THREE.Points(markerGeo, new THREE.PointsMaterial({ size:7, sizeAttenuation:false, map:dotTex, color:0xdfe5e8, transparent:true, opacity:0.95, depthWrite:false, alphaTest:0.2 }));
  markers.frustumCulled = false; scene.add(markers);

  // orbit lines, habitable-zone ring, solar-system overlay
  var orbitHolders = [];
  function hostPos(p){ return p.circum || stars.length === 1 ? new THREE.Vector3() : starPos[p.si]; }
  function buildOrbits(){
    planetObjs.forEach(function(po){ if (po.holder.parent) po.holder.parent.remove(po.holder); po.holder.children.forEach(function(c){ c.geometry.dispose(); }); po.holder.clear(); });
    planets.forEach(function(p, i){
      var po = planetObjs[i], pts = [], c = orientCoef(p), a = rad(p.au), o = {x:0, y:0, z:0};
      for (var k = 0; k <= 3600; k++){
        var an = k/3600*TAU, rr = a*(1 - p.ecc*p.ecc)/(1 + p.ecc*Math.cos(an));
        orient(c, rr*Math.cos(an), rr*Math.sin(an), o); pts.push(new THREE.Vector3(o.x, o.y, o.z));
      }
      var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.2, depthWrite:false }));
      po.holder.add(line); po.line = line; sysGroup.add(po.holder);
    });
    applySelectionStyle();
  }
  var hzMesh = null;
  function buildHZ(){
    if (hzMesh){ scene.remove(hzMesh); hzMesh.geometry.dispose(); hzMesh = null; }
    if (!hz) return;
    var ri = rad(hz.lo), ro = rad(hz.hi);
    if (ro - ri < 0.04){ ri = Math.max(0.05, ri - 0.03); ro = ro + 0.03; }
    hzMesh = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 160, 1), hzRingMaterial(ri, ro));
    hzMesh.rotation.x = -Math.PI/2; hzMesh.visible = tog.hz; scene.add(hzMesh);
  }
  var solarRefs = [['MERCURY', 0.387], ['VENUS', 0.723], ['EARTH', 1.0]], solarLabels = [];
  function buildSolar(){
    overlay.children.slice().forEach(function(c){ overlay.remove(c); c.geometry.dispose(); });
    solarRefs.forEach(function(r){
      var a = rad(r[1]), pts = [];
      for (var k = 0; k <= 160; k++) pts.push(new THREE.Vector3(a*Math.cos(k/160*TAU), 0, a*Math.sin(k/160*TAU)));
      var l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color:0xff5a5a, dashSize:0.12, gapSize:0.1, transparent:true, opacity:0.55, depthWrite:false }));
      l.computeLineDistances(); overlay.add(l);
    });
    overlay.visible = tog.solar;
  }

  /* ---- UI state ---- */
  var tog = { orbits:true, labels:true, hz:true, solar:false, spin:!reduceMotion };
  var speedMul = 1, paused = false, sel = null;      // sel: {kind:'planet'|'star', i}
  var baseYps = Pmin/8;                              // simulated years per second at 1x: the innermost planet laps in ~8 s

  var labelsEl = $('#labels'), labelEls = [];
  function mkLabel(text, cls){ var d = document.createElement('div'); d.className = 'lbl ' + (cls || ''); d.textContent = text; labelsEl.appendChild(d); return d; }
  var starLabels = stars.map(function(s){ return mkLabel(s.name, 'star'); });
  var planetLabels = planets.map(function(p, i){ var d = mkLabel(p.name, p.hz ? 'hz' : ''); d.addEventListener('click', function(){ select({ kind:'planet', i:i }); }); return d; });
  var solarLabelEls = solarRefs.map(function(r){ return mkLabel(r[0] + ' ORBIT', 'ref'); });

  // lists
  var listEl = $('#planetList');
  function fmtPeriod(y){ var d = y*365.25; if (d < 1) return (d*24).toFixed(1) + ' hours'; if (d < 1000) return d.toFixed(d < 10 ? 2 : 1) + ' days'; return y.toFixed(y < 10 ? 2 : 1) + ' years'; }
  function fmtN(x, d){ return Number(x).toLocaleString('en-US', { maximumFractionDigits:d === undefined ? 2 : d }); }
  function hex6(h){ return '#' + ('000000' + h.toString(16)).slice(-6); }
  function buildList(){
    var html = '';
    stars.forEach(function(s, i){
      html += '<button class="row star" type="button" data-k="star" data-i="' + i + '"><i style="background:' + s.col.getStyle() + '"></i><span class="nm">' + esc(s.name) + '</span><span class="sub">' + esc(s.cls ? s.cls + '-type · ' : '') + fmtN(s.T, 0) + ' K</span></button>';
    });
    planets.forEach(function(p, i){
      html += '<button class="row" type="button" data-k="planet" data-i="' + i + '"><i style="background:' + hex6(p.hex) + '"></i><span class="nm">' + esc(dispName(p)) + (p.hz ? ' <em>HZ</em>' : '') + '</span><span class="sub">' + fmtPeriod(p.P) + '</span></button>';
    });
    listEl.innerHTML = html;
  }
  listEl.addEventListener('click', function(e){
    var b = e.target.closest('.row'); if (!b) return;
    select({ kind:b.dataset.k, i:+b.dataset.i });
  });
  $('#listCount').textContent = planets.length + (planets.length === 1 ? ' PLANET' : ' PLANETS');

  // info card
  var card = $('#infoCard');
  function dispName(p){ return /^[a-z]{1,2}$/i.test(p.name) ? stars[0].name + ' ' + p.name : p.name; }
  function row(l, v){ return '<div class="kv"><span>' + l + '</span><b>' + v + '</b></div>'; }
  function showCard(){
    if (!sel){ card.hidden = true; return; }
    var h = '';
    if (sel.kind === 'planet'){
      var p = planets[sel.i], dens = p.massME/Math.pow(p.radiusRE, 3)*5.51;
      var hzTxt = p.hz ? '<span class="ok">INSIDE HABITABLE ZONE</span>' : (p.flux > HZ_HI ? 'TOO HOT (past inner edge)' : 'TOO COLD (past outer edge)');
      var incTxt = (p.inc === null || p.inc === undefined || !isFinite(p.inc)) ? 'not in data' : p.inc.toFixed(2) + '°' + (Math.abs(p.inc - 90) < 3 ? ' (edge-on)' : '');
      h = '<div class="ctag">PLANET</div><h2>' + esc(dispName(p)) + '</h2><div class="csub">' + TYPES[p.type].label.toUpperCase() + (p.hasRing ? ' · RINGED' : '') + '</div>' +
        row('RADIUS', fmtN(p.radiusRE) + ' R⊕') + row('MASS', fmtN(p.massME) + ' M⊕') + row('DENSITY', fmtN(dens, 1) + ' g/cm³') +
        row('ORBIT', fmtN(p.au, 4) + ' AU') + row('VS MERCURY', fmtN(p.au/MERCURY_AU, 2) + '× its distance') + row('YEAR LENGTH', fmtPeriod(p.P)) +
        row('ECCENTRICITY', fmtN(p.ecc, 3)) + row('INCLINATION', incTxt) + row('STARLIGHT', fmtN(p.flux, p.flux < 10 ? 2 : 0) + '× Earth') +
        row('EQ. TEMP', Math.round(p.teq) + ' K (' + Math.round(p.teq - 273.15) + ' °C)') + row('HAB. ZONE', hzTxt) +
        '<p class="cnote">Equilibrium temperature assumes no atmosphere and a typical reflectivity for this planet type. Real surfaces differ. Year length is worked out from the orbit size and the star\'s mass.</p>';
    } else {
      var s = stars[sel.i];
      h = '<div class="ctag">STAR</div><h2>' + esc(s.name) + '</h2><div class="csub">' + esc(s.cls ? s.cls + '-TYPE' : 'STAR') + '</div>' +
        row('TEMPERATURE', fmtN(s.T, 0) + ' K') + row('RADIUS', fmtN(s.R, 3) + ' R☉') + row('MASS', fmtN(s.M, 3) + ' M☉') + row('LUMINOSITY', s.L < 0.01 ? s.L.toExponential(2) + ' L☉' : fmtN(s.L, 3) + ' L☉');
      if (sel.i === 0 && hz) h += row('HAB. ZONE', fmtN(hz.lo, 3) + ' – ' + fmtN(hz.hi, 3) + ' AU');
      if (stars.length > 1 && sel.i > 0) h += row('SEPARATION', fmtN(s.au, 4) + ' AU');
    }
    var tid = sel.kind === 'planet' ? 'P-' + ('0' + (sel.i + 1)).slice(-2) : 'S-' + ('0' + (sel.i + 1)).slice(-2);
    card.innerHTML = '<span class="cc tl"></span><span class="cc tr"></span><span class="cc bl"></span><span class="cc br"></span><i class="scan"></i>' +
      '<div class="chead"><span><u></u>TARGET LOCKED</span><em>' + tid + ' · SCAN OK</em></div>' +
      '<button class="x" type="button" aria-label="Close">×</button>' + h;
    card.hidden = false;
    $('.x', card).addEventListener('click', function(){ select(null); });
    if (sel.kind === 'planet'){ var sb = document.createElement('button'); sb.className = 'b go full'; sb.type = 'button'; sb.textContent = 'VIEW FROM THE SURFACE'; sb.addEventListener('click', function(){ enterSurface(sel.i); }); card.appendChild(sb); }
    else if (sel.kind === 'star'){ var sb2 = document.createElement('button'); sb2.className = 'b go full'; sb2.type = 'button'; sb2.textContent = 'HOVER OVER THE STAR'; sb2.addEventListener('click', function(){ enterStarView(sel.i); }); card.appendChild(sb2); }
  }

  var cam = { az:0.7, pol:1.1, azT:0.7, polT:1.1, azV:0, polV:0, r:10, tr:10, target:new THREE.Vector3(), focus:null, off:new THREE.Vector3() };
  var wp0 = new THREE.Vector3();   // az/pol chase azT/polT, so every move is eased
  var R0 = 10;
  function fitRadius(){ var m = rad(aMax) + 1.2; if (tog.solar) m = Math.max(m, rad(1) + 0.5); return clamp(m*2.2, 5, 60); }
  function select(s){
    sel = s; cam.selAt = performance.now();
    cam.focus = null;
    if (s && s.kind === 'planet'){ cam.focus = planetObjs[s.i].g; cam.tr = Math.max(planetObjs[s.i].size*(scaleMode === 'true' ? 6 : 22), 1e-4); }
    else if (s && s.kind === 'star'){ cam.focus = starObjs[s.i].g; cam.tr = Math.max(starObjs[s.i].size*(scaleMode === 'true' ? 4 : 7), 1e-4); }
    else { cam.tr = R0; }
    if (cam.focus){ cam.focus.getWorldPosition(wp0); cam.off.copy(cam.target).sub(wp0); }
    listEl.querySelectorAll('.row').forEach(function(b){ b.classList.toggle('on', !!s && b.dataset.k === s.kind && +b.dataset.i === s.i); });
    planetLabels.forEach(function(l, i){ l.classList.toggle('on', !!s && s.kind === 'planet' && s.i === i); });
    applySelectionStyle(); showCard();
    try { var u = new URL(location.href); if (s && s.kind === 'planet') u.searchParams.set('planet', planets[s.i].name); else u.searchParams.delete('planet'); history.replaceState(null, '', u); } catch(e){}
  }
  function applySelectionStyle(){
    planetObjs.forEach(function(po, i){
      if (!po.line) return;
      var on = !!sel && sel.kind === 'planet' && sel.i === i;
      po.line.material.color.setHex(on ? 0xff2b2b : (planets[i].hz ? 0x39d98a : 0xffffff));
      po.line.material.opacity = on ? 0.95 : (planets[i].hz ? 0.32 : 0.2);
      po.line.visible = tog.orbits || on;
    });
  }
  function resetView(){ select(null); cam.azT = 0.7; cam.polT = 1.1; cam.azV = cam.polV = 0; cam.tr = R0; }

  /* ---- controls ---- */
  function setActive(group, attr, val){ group.forEach(function(b){ b.classList.toggle('on', b.getAttribute(attr) === String(val)); }); }
  var viewBtns = [].slice.call(document.querySelectorAll('[data-view]'));
  var playBtn = $('#bPlay'), timeEl = $('#timeReadout');
  function updTime(){
    var dps = baseYps*speedMul*365.25;
    timeEl.textContent = paused ? 'PAUSED' : '1 SEC = ' + (dps < 1 ? fmtN(dps*24, 1) + ' HRS' : (dps < 400 ? fmtN(dps, dps < 10 ? 1 : 0) + ' DAYS' : fmtN(dps/365.25, 1) + ' YEARS'));
    playBtn.textContent = paused ? '▶ PLAY' : '❚❚ PAUSE';
    syncSurfBar();                                   // keep the surface-view bar in step with the main controls
  }
  playBtn.addEventListener('click', function(){ paused = !paused; updTime(); });
  var speedEl = $('#speed'), speedVal = $('#speedVal');
  function readSpeed(){ speedMul = Math.pow(10, +speedEl.value); speedVal.textContent = (speedMul < 1 ? speedMul.toFixed(2) : speedMul < 10 ? speedMul.toFixed(1) : Math.round(speedMul)) + '×'; updTime(); }
  speedEl.addEventListener('input', function(){ paused = false; readSpeed(); });
  speedEl.addEventListener('dblclick', function(){ speedEl.value = 0; readSpeed(); });
  viewBtns.forEach(function(b){ b.addEventListener('click', function(){ var v = b.dataset.view; cam.polV = 0; if (v === 'top') cam.polT = 0.06; else if (v === 'edge'){ alignEarth(); if (!lc.on) setLC(true); } else cam.polT = 1.1; }); });
  $('#bReset').addEventListener('click', resetView);
  function bindToggle(id, key, after){
    var b = $(id); b.addEventListener('click', function(){ tog[key] = !tog[key]; b.setAttribute('aria-pressed', tog[key]); b.classList.toggle('on', tog[key]); after(); });
    b.setAttribute('aria-pressed', tog[key]); b.classList.toggle('on', tog[key]);
  }
  bindToggle('#tOrbits', 'orbits', applySelectionStyle);
  bindToggle('#tLabels', 'labels', function(){ labelsEl.style.display = (tog.labels && !surf) ? '' : 'none'; syncSurfBar(); });
  bindToggle('#tHZ', 'hz', function(){ if (hzMesh) hzMesh.visible = tog.hz; });
  bindToggle('#tSpin', 'spin', function(){});
  bindToggle('#tSolar', 'solar', function(){ overlay.visible = tog.solar; R0 = fitRadius(); if (!cam.focus) cam.tr = R0; });
  var scaleBtn = $('#tScale');
  function syncScaleBtn(){ scaleBtn.textContent = scaleMode === 'true' ? 'SCALE: TRUE' : 'SCALE: STYLIZED'; scaleBtn.classList.toggle('on', scaleMode === 'true'); }
  syncScaleBtn();
  function setScaleMode(m){
    scaleMode = m; syncScaleBtn();
    applySizes(); buildOrbits(); buildHZ(); buildSolar(); R0 = fitRadius();
    if (sel){ select(sel); } else cam.tr = R0;
  }
  scaleBtn.addEventListener('click', function(){ if (surf) return; setScaleMode(scaleMode === 'log' ? 'true' : 'log'); });
  window.addEventListener('keydown', function(e){
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var k = e.key.toLowerCase();
    if (k === ' '){ e.preventDefault(); paused = !paused; updTime(); }
    else if (k === 'a') $('#tSpin').click(); else if (k === 'r') resetView(); else if (k === 'l') $('#tLabels').click(); else if (k === 'o') $('#tOrbits').click(); else if (k === 's') $('#bSurf').click();
    else if (k === 'h') $('#tHZ').click(); else if (k === 't') $('#tLC').click(); else if (k === 'escape'){ if (surf) exitSurface(); else select(null); }
    else if (k === 'c' && surf && !e.ctrlKey && !e.metaKey) setClean(!surfClean);
    else if (surf && surfWorlds.length > 1 && (k === 'arrowright' || k === 'arrowleft')){            // surface view: left / right arrow = previous / next world (stars first, then planets)
      e.preventDefault();
      var cur = -1; surfWorlds.forEach(function(w, j){ if (w.kind === surf.kind && w.i === surf.i) cur = j; });
      enterWorld(surfWorlds[(cur + (k === 'arrowright' ? 1 : surfWorlds.length - 1)) % surfWorlds.length]);
    }
  });

  // pointer navigation: drag = rotate, wheel / pinch = zoom, tap = pick
  var ptrs = {}, moved = 0;
  var lastMoveT = 0;
  cv.addEventListener('pointerdown', function(e){ cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x:e.clientX, y:e.clientY }; moved = 0; if (!surf) cam.azV = cam.polV = 0; lastMoveT = e.timeStamp; });
  cv.addEventListener('pointermove', function(e){
    var p = ptrs[e.pointerId]; if (!p) return;
    var ids = Object.keys(ptrs);
    if (surf){                                                           // surface view: drag looks around, pinch zooms
      if (ids.length === 1){ var kk = surf.fov/70*0.005; surf.yaw -= (e.clientX - p.x)*kk; surf.pitch = clamp(surf.pitch + (e.clientY - p.y)*kk, -1.3, 1.5); moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); p.x = e.clientX; p.y = e.clientY; }
      else if (ids.length === 2){ var sa = ptrs[ids[0]], sb2 = ptrs[ids[1]], q0 = Math.hypot(sa.x - sb2.x, sa.y - sb2.y); p.x = e.clientX; p.y = e.clientY; var q1 = Math.hypot(sa.x - sb2.x, sa.y - sb2.y); if (q1 > 0){ surf.targetFov = clamp(surf.targetFov*q0/q1, 20, 100); surf.fov = surf.targetFov; } moved += 99; }
      return;
    }
    if (ids.length === 1){
      var dAz = -(e.clientX - p.x)*0.006, dPol = -(e.clientY - p.y)*0.006, mdt = Math.max(0.008, (e.timeStamp - lastMoveT)/1000);
      cam.azT += dAz; cam.polT = clamp(cam.polT + dPol, 0.04, Math.PI - 0.04);
      cam.azV += (dAz/mdt - cam.azV)*0.35; cam.polV += (dPol/mdt - cam.polV)*0.35;     // remember the flick speed so the camera coasts on release
      lastMoveT = e.timeStamp; moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); p.x = e.clientX; p.y = e.clientY;
    }
    else if (ids.length === 2){
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d0 = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX; p.y = e.clientY;
      var d1 = Math.hypot(a.x - b.x, a.y - b.y);
      if (d1 > 0) cam.tr = clamp(cam.tr*d0/d1, minR(), 120); moved += 99;
    }
  });
  function up(e){
    var p = ptrs[e.pointerId]; if (!p) return;
    var single = Object.keys(ptrs).length === 1;
    delete ptrs[e.pointerId];
    if (e.timeStamp - lastMoveT > 90 || moved < 6){ cam.azV = cam.polV = 0; }          // held still before letting go: no coasting
    if (single && moved < 6 && e.type === 'pointerup' && !surf) pick(e.clientX, e.clientY);
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function(e){ e.preventDefault(); var dy = e.deltaY*(e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1); dy = clamp(dy, -150, 150); if (surf){ surf.targetFov = clamp(surf.targetFov*Math.exp(dy*0.0012), 20, 100); return; } cam.tr = clamp(cam.tr*Math.exp(dy*0.0014), minR(), 120); }, { passive:false });
  cv.addEventListener('dblclick', resetView);

  var v3 = new THREE.Vector3();
  function minR(){ return scaleMode === 'true' ? 2e-4 : 0.5; }
  function pick(cx, cy){
    var r = cv.getBoundingClientRect(), best = null, bd = 34;
    function test(obj, kind, i){
      obj.getWorldPosition(v3); v3.project(camera);
      if (v3.z > 1) return;
      var d = Math.hypot((v3.x*0.5 + 0.5)*r.width + r.left - cx, (-v3.y*0.5 + 0.5)*r.height + r.top - cy);
      if (d < bd){ bd = d; best = { kind:kind, i:i }; }
    }
    planetObjs.forEach(function(po, i){ test(po.g, 'planet', i); });
    starObjs.forEach(function(so, i){ test(so.g, 'star', i); });
    select(best);
  }

  function resize(){
    var w = viewer.clientWidth, h = viewer.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w/h;
    camera.fov = surf ? 70 : (w/h < 0.8 ? 62 : 45); camera.updateProjectionMatrix();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(viewer); else window.addEventListener('resize', resize);

  /* ================= extras: light curve, surface view, photo ================= */
  var surf = null, lc = { on:false, n:0, W:1, data:new Float32Array(2200), col:null, f:0 };
  (function injectUI(){
    var ctr = $('.controls'), anchor = $('#tOrbits'), grp = document.createElement('div');
    grp.className = 'grp';
    grp.innerHTML = '<button class="b" id="tLC" type="button" title="Brightness of the star as seen from Earth: dips when a planet crosses it (T)">LIGHT CURVE</button>' +
      '<button class="b" id="bSurf" type="button" title="Stand on a planet and look around (S)">⛰ SURFACE</button>' +
      '<button class="b" id="bShot" type="button" title="Save this view as an image with a watermark">PHOTO</button>';
    var st = document.createElement('style');
    st.textContent = '.surfhud{position:absolute;z-index:5;right:clamp(16px,3vw,32px);top:88px;width:250px;padding:12px 14px;background:var(--panel);border:1px solid #3a1515;border-left:2px solid var(--red);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:9px;letter-spacing:0.14em;color:var(--text-dim)}' +
      '.surfhud[hidden]{display:none}.surfhud #surfInfo{white-space:pre-line;color:#e9edef;line-height:1.7;margin-bottom:8px}.surfhud label{display:flex;align-items:center;gap:8px}.surfhud input{flex:1;accent-color:#ff2b2b;min-width:0}.surfhud b{font-weight:400;color:var(--red);min-width:42px;text-align:right}.surfhud .tip{margin-top:8px;font-size:8px;color:var(--text-faint)}' +
      '@media (max-width:760px){.surfhud{top:56px;left:10px;right:10px;width:auto}}' +
      /* ===== SURFACE BAR (top of the screen in surface view) ===== */
      '.surfbar{position:absolute;z-index:7;bottom:12px;left:50%;transform:translateX(-50%);width:min(700px,calc(100% - 460px));display:flex;flex-direction:column;gap:8px}' +
      '.surfbar[hidden]{display:none}' +
      '.sb-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}' +
      '.sb-exit[hidden]{display:none}' +
      '.sb-exit{position:absolute;z-index:7;right:16px;bottom:16px;font:inherit;font-size:11px;font-weight:700;letter-spacing:.1em;padding:11px 18px;background:#e32222;color:#fff;border:1px solid #ff7a7a;cursor:pointer;box-shadow:0 0 16px rgba(255,43,43,.55)}' +
      '.sb-exit:hover{background:#ff3b3b;box-shadow:0 0 26px rgba(255,43,43,.8)}' +
      '.sb-play{font:inherit;font-size:10px;letter-spacing:.1em;padding:11px 14px;background:rgba(0,0,0,.6);color:#d9dde0;border:1px solid #3a4046;cursor:pointer}' +
      '.sb-play:hover{border-color:#ff2b2b}' +
      '.sb-play.on{color:#ff4a4a;border-color:#ff2b2b;background:rgba(255,43,43,.14)}' +
      '.viewer.clean .surfbar,.viewer.clean .surfcap,.viewer.clean .sb-exit{display:none!important}' +
      '.sb-show{position:absolute;z-index:7;left:50%;bottom:10px;transform:translateX(-50%);font:inherit;font-size:9px;letter-spacing:.12em;padding:7px 12px;background:rgba(0,0,0,.35);color:#d9dde0;border:1px solid rgba(255,255,255,.18);cursor:pointer;opacity:.35;transition:opacity .2s}' +
      '.sb-show:hover,.sb-show:focus{opacity:1}.sb-show[hidden]{display:none}' +
      '.sb-spd{display:flex;align-items:center;gap:8px;padding:9px 12px;background:rgba(0,0,0,.6);border:1px solid #3a4046;font-size:9px;letter-spacing:.12em;color:#ff2b2b;font-weight:700}' +
      '.sb-spd input{width:min(130px,26vw);accent-color:#ff2b2b;min-width:0}' +
      '.sb-spd b{font-weight:400;color:#ff2b2b;min-width:38px;text-align:right}' +
      '.sb-chips{display:flex;gap:6px;overflow-x:auto;max-width:100%;justify-content:center;padding-bottom:2px}' +
      '.sb-chip{font:inherit;font-size:10px;letter-spacing:.06em;white-space:nowrap;display:flex;align-items:center;gap:6px;padding:8px 11px;background:rgba(0,0,0,.6);color:#9aa2a7;border:1px solid #3a4046;cursor:pointer}' +
      '.sb-chip i{width:8px;height:8px;border-radius:50%;display:inline-block}' +
      '.sb-chip:hover{color:#fff;border-color:#8a1a1a}' +
      '.sb-chip.on{color:#ff4a4a;border-color:#ff2b2b;background:rgba(255,43,43,.14)}' +
      '.sb-info{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-size:9px;letter-spacing:.12em;color:#e9edef;text-shadow:0 0 10px #000,0 0 6px #000,0 0 3px #000}' +
      '.sb-tip{color:#8a9298}' +
      '@media (max-width:900px){.sb-tip{display:none}}' +
      '.viewer:not(.starview) #sbAltCtl{display:none}' +
      '.sb-chip.star{color:#ffd27a}' +
      '.sb-chip.star.on{border-color:#ffd27a;background:rgba(255,210,122,.14)}' +
      '.viewer .surfcap{bottom:140px}' +
      '@media (max-width:900px){.surfbar{left:12px;right:170px;width:auto;transform:none}}' +
      '@media (max-width:760px){.viewer .surfcap{bottom:205px}.sb-chips{justify-content:flex-start}.sb-exit{right:8px;bottom:12px;padding:11px 12px}.surfbar{left:8px;right:150px}}';
    document.head.appendChild(st);
    ctr.insertBefore(grp, anchor ? anchor.parentNode : null);
    viewer.insertAdjacentHTML('beforeend',
      '<div class="lc" id="lcPanel" hidden><div class="lc-h"><span>LIGHT CURVE</span><i>AS SEEN FROM EARTH · LIVE</i></div><canvas id="lcCv"></canvas><div class="lc-f" id="lcF"></div></div>' +
      '<div class="surfcap" id="surfCap" hidden></div>' +
      '<div class="surfbar" id="surfBar" hidden>' +
        '<div class="sb-info"><span id="surfInfo"></span><span class="sb-tip">DRAG: LOOK AROUND · WHEEL: ZOOM · ← → : OTHER WORLD · ESC: EXIT</span></div>' +
        '<div class="sb-row">' +
        '<button class="sb-play" id="sbPlay" type="button">❚❚ PAUSE</button>' +
        '<button class="sb-play" id="sbLabels" type="button" title="Show or hide the names in the sky (L)">LABELS: ON</button>' +
        '<button class="sb-play" id="sbClean" type="button" title="Hide every control and label for a clean view (C)">HIDE ALL</button>' +
        '<label class="sb-spd">SPEED <input id="sbSpeed" type="range" min="-1.3" max="1.7" step="0.01" value="0" aria-label="Simulation speed"><b id="sbSpeedVal">1×</b></label>' +
        '<label class="sb-spd">LATITUDE <input id="surfLat" type="range" min="-85" max="85" step="1" value="30" aria-label="Latitude"><b id="surfLatOut">N 30°</b></label>' +
        '<label class="sb-spd" id="sbAltCtl">ALTITUDE <input id="sbAlt" type="range" min="0" max="100" value="45" step="1" aria-label="Height above the star" title="How high you hover above the star, in star radii"><b id="sbAltOut">0.24×R</b></label></div>' +
        '<div class="sb-chips" id="sbChips" aria-label="Switch planet"></div>' +
      '</div>' +
      '<button class="sb-exit" id="sbExit" type="button" hidden>✕ EXIT SURFACE VIEW</button>' +
      '<button class="sb-show" id="sbShow" type="button" hidden>SHOW CONTROLS · C</button>' +
      '<div class="toast" id="toast" role="status"></div>');
  })();
  var surfCap = $('#surfCap'), lcPanel = $('#lcPanel'), lcCv = $('#lcCv'), lcF = $('#lcF'), toastEl = $('#toast');

  function toast(msg){ toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function(){ toastEl.classList.remove('on'); }, 2400); }

  /* ===== SURFACE BAR: exit button, pause + speed slider, one button per planet ===== */
  var surfBarEl = $('#surfBar'), sbSpeed = $('#sbSpeed'), sbSpeedVal = $('#sbSpeedVal'), sbPlay = $('#sbPlay'), sbLabels = $('#sbLabels'), sbClean = $('#sbClean'), sbShow = $('#sbShow'), sbChips = $('#sbChips'), surfClean = false;
  var surfWorlds = [];
  stars.forEach(function(s, i){ surfWorlds.push({ kind:'star', i:i }); });
  planets.forEach(function(p, i){ surfWorlds.push({ kind:'planet', i:i }); });
  function enterWorld(w){ if (w.kind === 'star') enterStarView(w.i); else enterSurface(w.i); }
  surfWorlds.forEach(function(w){
    var b = document.createElement('button'); b.type = 'button';
    var label, color;
    if (w.kind === 'star'){ var st = stars[w.i]; b.className = 'sb-chip star'; b.title = 'Hover above ' + st.name; label = '☀ ' + st.name; color = st.col.getStyle(); }
    else { var pl = planets[w.i]; b.className = 'sb-chip'; b.title = 'Stand on ' + dispName(pl); label = dispName(pl).replace(stars[0].name, '').trim() || pl.name; color = hex6(pl.hex); }
    b.innerHTML = '<i style="background:' + color + '"></i>' + esc(label);
    b.addEventListener('click', function(){ if (!(surf && surf.kind === w.kind && surf.i === w.i)) enterWorld(w); });   // jump straight to another world
    sbChips.appendChild(b);
  });
  function syncSurfBar(){
    if (!surfBarEl) return;
    sbSpeed.value = speedEl.value; sbSpeedVal.textContent = speedVal.textContent;
    sbPlay.textContent = paused ? '▶ PLAY' : '❚❚ PAUSE';
    sbLabels.textContent = tog.labels ? 'LABELS: ON' : 'LABELS: OFF'; sbLabels.classList.toggle('on', tog.labels);
    [].forEach.call(sbChips.children, function(c, j){ var w = surfWorlds[j]; c.classList.toggle('on', !!surf && !!w && surf.kind === w.kind && surf.i === w.i); });
  }
  sbSpeed.addEventListener('input', function(){ speedEl.value = sbSpeed.value; paused = false; readSpeed(); });
  sbSpeed.addEventListener('dblclick', function(){ speedEl.value = 0; readSpeed(); });
  sbPlay.addEventListener('click', function(){ paused = !paused; updTime(); });
  sbLabels.addEventListener('click', function(){ $('#tLabels').click(); });      // same switch as the main LABELS button and the L key
  // clean view: hides the whole bar, the caption, the exit button and every sky label. C or the faint button at the bottom brings it back.
  function setClean(on){ surfClean = !!on; viewer.classList.toggle('clean', surfClean); sbShow.hidden = !(surf && surfClean); }
  sbClean.addEventListener('click', function(){ setClean(true); });
  sbShow.addEventListener('click', function(){ setClean(false); });
  $('#sbExit').addEventListener('click', function(){ exitSurface(); });
  // altitude for the star hover view, in star radii (logarithmic: 0.02 to 5)
  var sbAlt = $('#sbAlt'), sbAltOut = $('#sbAltOut');
  function posToAlt(pos){ return 0.02*Math.pow(250, pos/100); }
  function altToPos(a){ return 100*Math.log(a/0.02)/Math.log(250); }
  function fmtAlt(a){ return (a < 1 ? a.toFixed(2) : a.toFixed(1)) + '×R'; }
  sbAlt.addEventListener('input', function(){ var a = posToAlt(parseFloat(sbAlt.value)); if (surf) surf.alt = a; sbAltOut.textContent = fmtAlt(a); });

  /* ---- 1. light curve: the star's brightness along the line of sight from Earth ---- */
  var Pmax = planets.length ? Math.max.apply(null, planets.map(function(p){ return p.P; })) : 1;
  lc.W = Math.min(Pmax*1.05, 40*Pmin);                                   // years of history shown
  var RsAU = stars[0].R*AU_PER_RSUN;
  planets.forEach(function(p){
    var rp = p.radiusRE*AU_PER_REARTH, hasInc = p.inc !== null && p.inc !== undefined && isFinite(p.inc);
    p.depth = Math.pow(rp/RsAU, 2);
    p.transits = p.si === 0 && (!hasInc || Math.abs(p.au*Math.cos(p.inc*D2R))/RsAU < 1 + rp/RsAU);
  });
  function overlap(R, r, d){                                               // area of the planet disc that covers the star disc
    if (r > R){ var t = R; R = r; r = t; }
    if (d >= R + r) return 0;
    if (d <= R - r) return Math.PI*r*r;
    var r2 = r*r, R2 = R*R, a = Math.acos((d*d + r2 - R2)/(2*d*r)), b = Math.acos((d*d + R2 - r2)/(2*d*R));
    return r2*a + R2*b - 0.5*Math.sqrt((-d + r + R)*(d + r - R)*(d - r + R)*(d + r + R));
  }
  function computeLC(){
    var N = lc.data.length, t1 = tSim, t0 = t1 - lc.W, area = Math.PI*RsAU*RsAU, i, j;
    for (i = 0; i < N; i++){
      var t = t0 + lc.W*i/(N - 1), f = 0;
      for (j = 0; j < planets.length; j++){
        var p = planets[j]; if (!p.transits) continue;
        var q = relPos(p, p.au, p.P, t);
        if (q.y >= 0) continue;                                            // behind the star as seen from Earth (Earth is on the -y side)
        f += overlap(RsAU, p.radiusRE*AU_PER_REARTH, Math.hypot(q.x, q.z))/area;
      }
      lc.data[i] = 1 - f;
    }
  }
  function drawLC(){
    var g = lcCv.getContext('2d'), cw = lcCv.width, ch = lcCv.height, dpr = cw/lcCv.clientWidth || 1, N = lc.data.length, i;
    var maxD = 0; planets.forEach(function(p){ if (p.transits) maxD = Math.max(maxD, p.depth); });
    g.clearRect(0, 0, cw, ch);
    var padL = 34*dpr, padR = 6*dpr, padT = 8*dpr, padB = 12*dpr, pw = cw - padL - padR, ph = ch - padT - padB;
    if (!maxD){
      g.fillStyle = '#71787e'; g.font = (10*dpr) + 'px Space Mono, monospace'; g.textAlign = 'center';
      g.fillText('NO PLANET CROSSES THE STAR', cw/2, ch/2 - 2*dpr); g.fillText('AS SEEN FROM EARTH', cw/2, ch/2 + 12*dpr); return;
    }
    var ymax = 1 + maxD*0.45, ymin = 1 - maxD*1.45;
    function Y(v){ return padT + (ymax - v)/(ymax - ymin)*ph; }
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.07)'; g.fillStyle = '#454b50'; g.font = (8*dpr) + 'px Space Mono, monospace'; g.textAlign = 'right';
    [0, -0.5, -1].forEach(function(k){ var v = 1 + k*maxD, y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(padL, y); g.lineTo(cw - padR, y); g.stroke(); g.fillText(k === 0 ? '100%' : (100*(v)).toFixed(maxD < 0.001 ? 3 : 2) + '%', padL - 4*dpr, y + 3*dpr); });
    var col = lc.col && lc.col.length === Math.ceil(pw) ? lc.col : (lc.col = new Float32Array(Math.ceil(pw)));
    col.fill(1);
    for (i = 0; i < N; i++){ var x = Math.min(col.length - 1, Math.floor(i/(N - 1)*(col.length - 1))); if (lc.data[i] < col[x]) col[x] = lc.data[i]; }   // keep the deepest value in each pixel so short dips never vanish
    g.beginPath();
    for (i = 0; i < col.length; i++){ var xx = padL + i, yy = Y(col[i]); if (i === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy); }
    g.shadowColor = 'rgba(255,43,43,0.7)'; g.shadowBlur = 6*dpr; g.strokeStyle = '#ff6a6a'; g.lineWidth = 1.4*dpr; g.stroke(); g.shadowBlur = 0;
    var yNow = Y(col[col.length - 1]);                                     // "now" marker at the right edge
    g.strokeStyle = 'rgba(255,43,43,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cw - padR - 0.5, padT); g.lineTo(cw - padR - 0.5, padT + ph); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cw - padR - 0.5, yNow, 2.6*dpr, 0, TAU); g.fill();
  }
  function updateLCFooter(){
    var items = planets.map(function(p){
      var d = p.transits ? (p.depth*100 < 0.1 ? (p.depth*100).toFixed(3) : (p.depth*100).toFixed(2)) + '%' : 'no transit';
      return '<span><i style="background:' + hex6(p.hex) + '"></i>' + esc(p.name) + ' ' + d + '</span>';
    }).join('');
    lcF.innerHTML = '<div class="lc-w">WINDOW ' + fmtPeriod(lc.W).toUpperCase() + ' · DIP = PLANET\'S DISC ÷ STAR\'S DISC</div><div class="lc-d">' + items + '</div>';
  }
  function setLC(on){
    lc.on = on; lcPanel.hidden = !on; $('#tLC').classList.toggle('on', on);
    if (on){ var dpr = Math.min(window.devicePixelRatio || 1, 2); lcCv.width = Math.round(lcCv.clientWidth*dpr) || 600; lcCv.height = Math.round(96*dpr); lc.col = null; updateLCFooter(); computeLC(); drawLC(); }
  }
  $('#tLC').addEventListener('click', function(){ setLC(!lc.on); });
  // "from Earth": the line of sight is the sky-plane normal, so this camera sees every transit edge-on
  function alignEarth(){
    var d = new THREE.Vector3(0, -1, 0).applyQuaternion(sysGroup.quaternion);
    var azTarget = Math.atan2(d.x, d.z), diff = ((azTarget - cam.azT + Math.PI) % TAU + TAU) % TAU - Math.PI;
    cam.azV = cam.polV = 0; cam.azT += diff; cam.polT = clamp(Math.acos(clamp(d.y, -1, 1)), 0.04, Math.PI - 0.04);
  }

  /* ===== SURFACE VIEW: procedural terrain + sky, every star and planet at its TRUE angular size ===== */
  var SURF_D = 40000, SURF_DOME = 120000;
  var surfG = null, surfTxtAt = 0;
  var surfInfo = $('#surfInfo'), surfLat = $('#surfLat'), surfLatOut = $('#surfLatOut');
  var _sv = {
    ea:new THREE.Vector3(), up:new THREE.Vector3(), no:new THREE.Vector3(), rel:new THREE.Vector3(), e1:new THREE.Vector3(), nA:new THREE.Vector3(),
    M:new THREE.Matrix4(), q:new THREE.Quaternion(), qWL:new THREE.Quaternion(), qTmp:new THREE.Quaternion(),
    qRx:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI/2), look:new THREE.Vector3()
  };
  function sstep(a, b, x){ var u = Math.max(0, Math.min(1, (x - a)/(b - a))); return u*u*(3 - 2*u); }

  var SURF_SKY_GLSL = [
    'uniform vec3 uSunDir[3]; uniform vec3 uSunCol[3]; uniform float uAtm; uniform vec3 uZen; uniform vec3 uHor;',
    'vec3 skyColor(vec3 d){',
    '  if (uAtm < 0.001) return vec3(0.0);',
    '  vec3 col = vec3(0.0);',
    '  float up = clamp(d.y, 0.0, 1.0);',
    '  float g = pow(1.0 - up, 3.0);',
    '  vec3 dh = normalize(vec3(d.x, 0.0, d.z) + vec3(1e-4, 0.0, 0.0));',
    '  for (int i=0;i<3;i++){',
    '    vec3 sc = uSunCol[i];',
    '    float inten = max(max(sc.r, sc.g), sc.b);',
    '    if (inten > 0.001){',
    '      vec3 sd = uSunDir[i];',
    '      vec3 tint = sc/inten;',
    '      float day = smoothstep(-0.10, 0.25, sd.y);',
    '      col += mix(uZen, uHor, g)*tint*day*min(inten, 1.6);',
    '      float cs = max(dot(d, sd), 0.0);',
    '      float vis = smoothstep(-0.14, 0.05, sd.y);',
    '      col += sc*(pow(cs, 16.0)*0.10 + pow(cs, 700.0)*1.2)*vis*uAtm;',
    '      float tw = exp(-pow((sd.y + 0.01)/0.13, 2.0));',
    '      vec3 sh = normalize(vec3(sd.x, 0.0, sd.z) + vec3(1e-4, 0.0, 0.0));',
    '      float side = pow(max(dot(dh, sh), 0.0), 3.0);',
    '      col += vec3(1.0, 0.42, 0.14)*tint*tw*side*exp(-up*4.0)*0.85;',
    '    }',
    '  }',
    '  return col;',
    '}',
    'vec3 tone(vec3 c){ return vec3(1.0) - exp(-c*1.25); }'
  ].join('\n');

  /* ===== SURFACE TERRAIN: uOff moves the sampling point, so each latitude is different ground ===== */
  var SURF_TERRAIN_COMMON = [
    'uniform float uAmp; uniform float uRidge; uniform float uCrater; uniform vec2 uSeedT; uniform vec2 uOff;',
    'float tHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }',
    'float tNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0 - 2.0*f);',
    '  return mix(mix(tHash(i), tHash(i + vec2(1.0,0.0)), f.x), mix(tHash(i + vec2(0.0,1.0)), tHash(i + vec2(1.0,1.0)), f.x), f.y); }',
    // craters: a bowl with a raised rim, one candidate per grid cell
    'float tCrater(vec2 p, float scale){',
    '  vec2 q = p/scale; vec2 i = floor(q); vec2 f = fract(q); float h = 0.0;',
    '  for (int y=-1; y<=1; y++){ for (int x=-1; x<=1; x++){',
    '    vec2 g = vec2(float(x), float(y)); vec2 id = i + g;',
    '    if (tHash(id + 31.7) > 0.5){',
    '      vec2 c = g + vec2(tHash(id + 7.1), tHash(id + 19.3)) - f;',
    '      float rad = 0.14 + 0.3*tHash(id + 3.3);',
    '      float d = length(c)/rad;',
    '      h += ((d < 1.0 ? -(1.0 - d*d) : 0.0) + 0.35*exp(-pow((d - 1.08)/0.22, 2.0)))*rad;',
    '    }',
    '  } }',
    '  return h;',
    '}',
    'float tH(vec2 p){',
    '  float r = length(p);',
    '  float mask = smoothstep(14.0, 800.0, r);',          // flat clearing around the viewer, hills grow outward
    '  p += uOff;',                                         // latitude: stand on different ground (the clearing stays centred on you)
    '  vec2 q = p*0.00022 + uSeedT;',
    '  float h = 0.0; float a = 0.5;',
    '  for (int i=0;i<7;i++){ h += a*tNoise(q); q = q*2.05 + vec2(5.2, 1.3); a *= 0.5; }',
    '  float rid = 1.0 - abs(2.0*tNoise(p*0.0004 + uSeedT*1.7) - 1.0);',
    '  float m = mix(h, rid*rid*0.9, uRidge);',
    '  float hh = (m - 0.3)*uAmp;',
    '  if (uCrater > 0.001){',
    '    hh += (tCrater(p, 900.0)*0.22*900.0 + tCrater(p + 13.0, 210.0)*0.2*210.0)*uCrater;',
    '    if (r < 700.0) hh += tCrater(p + 71.0, 48.0)*0.18*48.0*uCrater;',
    '  }',
    '  return hh*mask;',
    '}'
  ].join('\n');

  var SURF_TERRAIN_VERT = [
    'varying vec3 vW; varying vec3 vN; varying float vH; varying vec3 vFog;',
    'void main(){',
    '  vec2 p = position.xz;',
    '  float h = tH(p);',
    '  float eps = clamp(length(p)*0.003, 0.5, 60.0);',
    '  float hx = tH(p + vec2(eps, 0.0)) - h;',
    '  float hz = tH(p + vec2(0.0, eps)) - h;',
    '  vN = normalize(vec3(-hx, eps, -hz));',
    '  vW = vec3(p.x, h, p.y); vH = h;',
    '  vec3 tc = vW - cameraPosition;',
    '  vFog = (uAtm > 0.001) ? skyColor(normalize(vec3(tc.x, 0.02*length(tc.xz), tc.z))) : vec3(0.0);',
    '  gl_Position = projectionMatrix*viewMatrix*vec4(vW, 1.0);',
    '}'
  ].join('\n');

  var SURF_TERRAIN_FRAG = [
    'varying vec3 vW; varying vec3 vN; varying float vH; varying vec3 vFog;',
    'uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uCs; uniform float uCloud; uniform float uVis; uniform vec3 uAmb;',
    'float micro(vec2 p, float k){ return 0.7*tNoise(p*0.35) + 0.3*k*tNoise(p*1.1 + 3.7); }',
    'void main(){',
    '  vec3 N0 = normalize(vN);',
    '  float dist = length(vW - cameraPosition);',
    '  float mb = smoothstep(260.0, 10.0, dist); float kk = smoothstep(60.0, 6.0, dist);',
    '  vec2 g = vW.xz + uOff; float n0 = micro(g, kk);',   // same shift as the terrain shape, so colours follow the land
    '  vec3 N = N0;',
    '  if (mb > 0.01){ float e = 0.4; N = normalize(N0 + vec3(-(micro(g + vec2(e, 0.0), kk) - n0)/e, 0.0, -(micro(g + vec2(0.0, e), kk) - n0)/e)*0.3*mb); }',
    '  float pat = 0.6*tNoise(g*0.0035 + uSeedT*3.1) + 0.4*tNoise(g*0.02 + uSeedT*7.0);',
    '  float hn = clamp(vH/(uAmp + 1.0), -0.6, 1.0);',
    '  vec3 col;',
    '  if (uCloud > 0.5){',
    '    float band = 0.5 + 0.5*sin(g.y*0.00045 + tNoise(g*0.0009 + uSeedT)*7.0);',
    '    col = mix(uC0, uC1, band*0.7 + pat*0.3);',
    '    col = mix(col, uC2, smoothstep(0.1, 0.9, hn)*0.5);',
    '  } else {',
    '    col = mix(uC0, uC1, smoothstep(0.25, 0.75, pat));',
    '    col = mix(col, uC2, smoothstep(0.35, 0.95, hn*1.4 + pat*0.25 - 0.1)*0.8);',
    '    col = mix(col, uCs, smoothstep(0.1, 0.4, 1.0 - N0.y)*0.85);',
    '  }',
    '  col *= 0.9 + 0.2*n0;',
    '  vec3 lit = uAmb;',
    '  for (int i=0;i<3;i++){',
    '    vec3 sc = uSunCol[i];',
    '    if (max(max(sc.r, sc.g), sc.b) > 0.001){',
    '      vec3 sd = uSunDir[i];',
    '      float vis = smoothstep(-0.03, 0.05, sd.y);',
    '      vec3 ext = (uAtm > 0.001) ? exp(-vec3(0.25, 0.55, 1.15)*uAtm*0.28/max(sd.y, 0.05)) : vec3(1.0);',
    '      lit += sc*ext*max(dot(N, sd), 0.0)*vis*1.15;',
    '    }',
    '  }',
    '  col *= lit;',
    '  if (uAtm > 0.001){',
    '    float f = 1.0 - exp(-pow(dist/uVis, 1.35));',
    '    col = mix(col, vFog, f);',
    '  }',
    '  gl_FragColor = vec4(tone(col), 1.0);',
    '}'
  ].join('\n');

  // what the ground and sky of each kind of world look like
  function surfaceProfile(kind, typeId, hexNum){
    var base = new THREE.Color(hexNum);
    function tint(r, g, b){ return new THREE.Color(Math.min(1.6, base.r*r), Math.min(1.6, base.g*g), Math.min(1.6, base.b*b)); }
    function toWhite(c, k){ return c.clone().lerp(new THREE.Color(1, 1, 1), k); }
    var key = typeId;
    if (kind === 'moon' && typeId === 'rocky') key = 'dwarf';
    var P = { atm:0, amp:500, ridge:0.4, crater:0, cloud:0, vis:9000, camH:2,
      zen:new THREE.Color(0, 0, 0), hor:new THREE.Color(0, 0, 0), label:'SOLID SURFACE · NO ATMOSPHERE' };
    switch (key){
      case 'rocky':
        P.atm = 0.85; P.amp = 320; P.ridge = 0.5; P.crater = 0.18; P.vis = 9000;
        P.zen.setRGB(0.16, 0.33, 0.8); P.hor.setRGB(0.62, 0.74, 0.92);
        P.c0 = tint(0.55, 0.5, 0.45); P.c1 = tint(1, 1, 1); P.c2 = tint(1.35, 1.3, 1.2); P.cs = tint(0.42, 0.38, 0.36);
        P.label = 'SOLID SURFACE · THIN ATMOSPHERE'; break;
      case 'superearth':
        P.atm = 1.1; P.amp = 480; P.ridge = 0.65; P.crater = 0.03; P.vis = 7000;
        P.zen.setRGB(0.14, 0.3, 0.75); P.hor.setRGB(0.6, 0.72, 0.9);
        P.c0 = tint(0.55, 0.5, 0.45); P.c1 = tint(1, 1, 1); P.c2 = tint(1.3, 1.25, 1.2); P.cs = tint(0.4, 0.36, 0.34);
        P.label = 'SOLID SURFACE · DENSE ATMOSPHERE'; break;
      case 'icy':
        P.atm = 0; P.amp = 260; P.ridge = 0.45; P.crater = 0.55;
        P.c0 = tint(0.7, 0.8, 0.9); P.c1 = tint(1, 1, 1); P.c2 = toWhite(base, 0.6); P.cs = tint(0.5, 0.62, 0.78); break;
      case 'volcanic':
        P.atm = 0; P.amp = 360; P.ridge = 0.6; P.crater = 0.2;
        P.c0 = tint(0.7, 0.45, 0.25); P.c1 = tint(1, 1, 1); P.c2 = tint(1.2, 1.2, 0.9); P.cs = new THREE.Color(0.2, 0.14, 0.1); break;
      case 'minineptune': case 'ice': case 'gas':
        P.cloud = 1; P.atm = key === 'gas' ? 1.8 : 1.5; P.amp = 70; P.ridge = 0; P.vis = 4000; P.camH = 30;
        if (key === 'gas'){ P.zen = tint(0.5, 0.4, 0.3); P.hor = toWhite(tint(1.05, 0.95, 0.8), 0.15); }
        else { P.zen = tint(0.4, 0.5, 0.65); P.hor = toWhite(tint(1, 1, 0.98), 0.25); }
        P.c0 = tint(0.78, 0.78, 0.78); P.c1 = tint(1.1, 1.1, 1.1); P.c2 = toWhite(base, 0.5); P.cs = tint(0.6, 0.6, 0.6);
        P.label = 'CLOUD TOPS · NO SOLID SURFACE'; break;
      default: // dwarf / airless rock
        P.atm = 0; P.amp = 220; P.ridge = 0.25; P.crater = 1.0;
        P.c0 = tint(0.55, 0.55, 0.55); P.c1 = tint(0.95, 0.95, 0.95); P.c2 = tint(1.3, 1.3, 1.3); P.cs = tint(0.4, 0.4, 0.4);
    }
    return P;
  }

  function surfacePolarGrid(nr, nt, r0, r1){
    var pos = new Float32Array((nr + 1)*nt*3), idx = [], i, j;
    for (i = 0; i <= nr; i++){
      var r = i === 0 ? 0 : r0*Math.pow(r1/r0, (i - 1)/(nr - 1));    // rings spread out exponentially: fine near the viewer, far to the horizon
      for (j = 0; j < nt; j++){
        var a = (j/nt)*Math.PI*2, o = (i*nt + j)*3;
        pos[o] = r*Math.cos(a); pos[o + 1] = 0; pos[o + 2] = r*Math.sin(a);
      }
    }
    for (i = 0; i < nr; i++) for (j = 0; j < nt; j++){
      var a0 = i*nt + j, b0 = i*nt + (j + 1)%nt, c0 = (i + 1)*nt + j, d0 = (i + 1)*nt + (j + 1)%nt;
      idx.push(a0, c0, b0, b0, c0, d0);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  function surfaceBuild(){
    var G = {};
    G.skyScene = new THREE.Scene();
    G.gndScene = new THREE.Scene();
    G.cam = new THREE.PerspectiveCamera(70, 1, 0.3, 400000);
    G.sunDir = [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0)];
    G.sunCol = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    G.uni = { uSunDir:{value:G.sunDir}, uSunCol:{value:G.sunCol}, uAtm:{value:0}, uZen:{value:new THREE.Color()}, uHor:{value:new THREE.Color()} };

    // sky dome
    G.dome = new THREE.Mesh(new THREE.SphereGeometry(SURF_DOME, 48, 24), new THREE.ShaderMaterial({
      uniforms:G.uni, side:THREE.BackSide, depthWrite:false,
      vertexShader:'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
      fragmentShader:SURF_SKY_GLSL + '\nvarying vec3 vD; void main(){ gl_FragColor = vec4(tone(skyColor(normalize(vD))), 1.0); }'
    }));
    G.dome.renderOrder = -10; G.dome.frustumCulled = false;
    G.skyScene.add(G.dome);

    // background stars, with a faint denser band like a galaxy disc
    var N = 3000, pos = new Float32Array(N*3), col = new Float32Array(N*3), v = new THREE.Vector3(), eu = new THREE.Euler(0.9, 0.3, 0.6);
    for (var i = 0; i < N; i++){
      if (i < N*0.45){
        var th = Math.random()*Math.PI*2, bl = (Math.random() + Math.random() + Math.random() - 1.5)*0.16;
        v.set(Math.cos(th)*Math.cos(bl), Math.sin(bl), Math.sin(th)*Math.cos(bl)).applyEuler(eu);
      } else {
        var u1 = Math.random()*2 - 1, th2 = Math.random()*Math.PI*2, s1 = Math.sqrt(1 - u1*u1);
        v.set(s1*Math.cos(th2), u1, s1*Math.sin(th2));
      }
      v.multiplyScalar(SURF_DOME*0.92);
      pos[i*3] = v.x; pos[i*3 + 1] = v.y; pos[i*3 + 2] = v.z;
      var tn = Math.random(), br = 0.3 + Math.pow(Math.random(), 3)*0.7, cr, cg, cb;
      if (tn < 0.15){ cr = 0.7; cg = 0.8; cb = 1; } else if (tn < 0.3){ cr = 1; cg = 0.88; cb = 0.7; } else { cr = 1; cg = 1; cb = 1; }
      col[i*3] = cr*br; col[i*3 + 1] = cg*br; col[i*3 + 2] = cb*br;
    }
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    G.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size:1.8, sizeAttenuation:false, vertexColors:true, transparent:true, depthWrite:false }));
    G.stars.frustumCulled = false;
    G.skyScene.add(G.stars);

    // light that falls on the other planets and moons in the sky
    G.lights = [];
    for (var k = 0; k < 3; k++){ var dl = new THREE.DirectionalLight(0xffffff, 0); G.skyScene.add(dl); G.lights.push(dl); }
    G.skyScene.add(new THREE.AmbientLight(0x14151c, 1.0));

    G.sphere = new THREE.SphereGeometry(1, 64, 48);
    G.bodies = [];

    // terrain
    var tu = {
      uAmp:{value:500}, uRidge:{value:0.4}, uCrater:{value:0}, uSeedT:{value:new THREE.Vector2()}, uOff:{value:new THREE.Vector2()},
      uC0:{value:new THREE.Color()}, uC1:{value:new THREE.Color()}, uC2:{value:new THREE.Color()}, uCs:{value:new THREE.Color()},
      uCloud:{value:0}, uVis:{value:9000}, uAmb:{value:new THREE.Color(0.01, 0.01, 0.012)}
    };
    for (var key in G.uni) tu[key] = G.uni[key];
    G.tu = tu;
    G.terrain = new THREE.Mesh(surfacePolarGrid(180, 256, 0.6, 28000), new THREE.ShaderMaterial({
      uniforms:tu, side:THREE.DoubleSide,
      vertexShader:SURF_SKY_GLSL + '\n' + SURF_TERRAIN_COMMON + '\n' + SURF_TERRAIN_VERT,
      fragmentShader:SURF_TERRAIN_COMMON + '\n' + SURF_SKY_GLSL + '\n' + SURF_TERRAIN_FRAG
    }));
    G.terrain.frustumCulled = false;
    G.gndScene.add(G.terrain);
    return G;
  }

  function makeSkyLabel(text, hex){
    var c = document.createElement('canvas'); c.width = 512; c.height = 128;
    var g = c.getContext('2d'); g.font = 'bold 40px Space Mono, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#000'; g.shadowBlur = 10; g.fillStyle = '#fff'; g.fillText(String(text).toUpperCase().slice(0, 18), 256, 64);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthTest:false, depthWrite:false, color:hex || 0xffffff }));
    s.renderOrder = 1000; return s;
  }
  function makeSkyGlow(color, opacity){
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:color, transparent:true, opacity:opacity, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false }));
    s.renderOrder = 500; return s;
  }
  function surfaceClearBodies(){
    var G = surfG; if (!G || !G.bodies) return;
    G.bodies.forEach(function(b){
      [b.mesh, b.ring, b.glow, b.dot, b.label].forEach(function(o){
        if (!o) return;
        G.skyScene.remove(o);
        if (o.material){ if (o.material.map && o !== b.glow && o !== b.dot) o.material.map.dispose(); o.material.dispose(); }
        if (o.geometry && !o.isSprite && o.geometry !== G.sphere) o.geometry.dispose();
      });
    });
    G.bodies = [];
  }
  function surfaceMakeBodies(){
    var G = surfG; surfaceClearBodies();
    stars.forEach(function(s, i){
      var isBH = s.cls === 'BH', col = s.col.clone();
      if (surf.kind === 'star' && surf.i === i){   // the star you hover over is the ground below you: it only lights the other bodies
        G.bodies.push({ kind:'star', idx:i, mesh:null, glow:null, label:null, color:col, rAU:s.R*AU_PER_RSUN, lum:s.L, src:starObjs[i].g, dir:new THREE.Vector3(), alive:false, name:s.name, hidden:true });
        return;
      }
      var mesh = new THREE.Mesh(G.sphere, isBH ? new THREE.MeshBasicMaterial({ color:0x000000 }) : starMaterial(col));
      G.skyScene.add(mesh);
      var glow = null; if (!isBH){ glow = makeSkyGlow(col, 0.85); G.skyScene.add(glow); }
      var label = makeSkyLabel(s.name); G.skyScene.add(label);
      G.bodies.push({ kind:'star', idx:i, mesh:mesh, glow:glow, label:label, color:col, rAU:s.R*AU_PER_RSUN, lum:s.L, src:starObjs[i].g, dir:new THREE.Vector3(), alive:false, name:s.name });
    });
    planets.forEach(function(p, j){
      if (surf.kind === 'planet' && j === surf.i) return;
      var po = planetObjs[j];
      var mesh = new THREE.Mesh(G.sphere, makeBodyMaterial(p.type, p.hex, p.name, bodyRoughness(p.type), 0.03));
      G.skyScene.add(mesh);
      var ring = null;
      if (p.hasRing){
        var rg = new THREE.RingGeometry(1.55, 2.6, 128); fixRingUVs(rg, 1.55, 2.6);
        ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map:ringTexture(p.hex, j + 1), transparent:true, opacity:0.85, side:THREE.DoubleSide, depthWrite:false }));
        G.skyScene.add(ring);
      }
      var dot = makeSkyGlow(new THREE.Color(p.hex), 0.8); G.skyScene.add(dot);
      var label = makeSkyLabel(dispName(p), 0xffffff); G.skyScene.add(label);
      G.bodies.push({ kind:'planet', idx:j, mesh:mesh, ring:ring, dot:dot, label:label, color:new THREE.Color(p.hex), rAU:p.radiusRE*AU_PER_REARTH, src:po.mesh, dir:new THREE.Vector3(), alive:false, name:p.name });
    });
  }
  function realPositionsAU(){          // surface view always runs at true scale, so world position / KU is AU
    var res = { stars:[], planets:[] }, v = new THREE.Vector3();
    starObjs.forEach(function(so){ so.g.getWorldPosition(v); res.stars.push(v.clone().divideScalar(KU)); });
    planetObjs.forEach(function(po){ po.g.getWorldPosition(v); res.planets.push(v.clone().divideScalar(KU)); });
    return res;
  }
  function setSurfLat(deg){
    if (surf) surf.lat = deg*D2R;
    surfLatOut.textContent = (deg >= 0 ? 'N ' : 'S ') + Math.abs(deg).toFixed(0) + '°';
  }
  surfLat.addEventListener('input', function(){ setSurfLat(parseFloat(surfLat.value) || 0); });

  // ---- hovering over a star: surface of the star (granulation computed per pixel, so it stays sharp up close) ----
  function makeStarGroundMaterial(col){
    return new THREE.ShaderMaterial({
      uniforms:{ tint:{ value:new THREE.Color(col) }, time:{ value:0 } },
      vertexShader:'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = normalize(position); vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader:[
        'uniform vec3 tint; uniform float time; varying vec3 vP; varying vec3 vN; varying vec3 vV;',
        'float hh(vec3 p){ p = 50.0*fract(p*0.3183099 + vec3(0.71,0.113,0.419)); return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
        'float vn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0 - 2.0*f);',
        '  return mix(mix(mix(hh(i), hh(i+vec3(1.0,0.0,0.0)), f.x), mix(hh(i+vec3(0.0,1.0,0.0)), hh(i+vec3(1.0,1.0,0.0)), f.x), f.y),',
        '             mix(mix(hh(i+vec3(0.0,0.0,1.0)), hh(i+vec3(1.0,0.0,1.0)), f.x), mix(hh(i+vec3(0.0,1.0,1.0)), hh(i+vec3(1.0,1.0,1.0)), f.x), f.y), f.z); }',
        // x = distance to the nearest cell point, y = (second nearest - nearest), z = random id of the nearest cell
        'vec3 wor(vec3 p){',
        '  vec3 i = floor(p); vec3 f = fract(p); float d1 = 9.0; float d2 = 9.0; float id = 0.0;',
        '  for (int z=-1; z<=1; z++){ for (int y=-1; y<=1; y++){ for (int x=-1; x<=1; x++){',
        '    vec3 g = vec3(float(x), float(y), float(z)); vec3 c = i + g;',
        '    vec3 o = vec3(hh(c), hh(c + 17.0), hh(c + 43.0));',
        '    vec3 r = g + o - f; float d = dot(r, r);',
        '    if (d < d1){ d2 = d1; d1 = d; id = hh(c + 71.0); } else if (d < d2){ d2 = d; }',
        '  } } }',
        '  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);',
        '}',
        'void main(){',
        '  vec3 p = normalize(vP);',
        '  vec3 w = vec3(vn(p*9.0), vn(p*9.0 + 5.2), vn(p*9.0 + 9.1)) - 0.5;',
        '  vec3 a = wor(p*120.0 + w*5.0);',                                // cells, warped so they are not a regular tiling
        '  vec3 b = wor(p*480.0 + w*14.0 + 3.7);',                         // fine grain
        '  float edge = smoothstep(0.0, 1.1, a.y);',                      // 0 on the lanes between cells, 1 inside a cell
        '  float core = 1.0 - smoothstep(0.0, 0.85, a.x);',
        '  float cellL = (0.9 + 0.18*core)*(0.93 + 0.14*a.z)*(0.95 + 0.1*b.z);',
        '  cellL *= 0.9 + 0.2*vn(p*7.0 + 2.0);',                           // slow mottling
        '  cellL *= 1.0 - 0.4*smoothstep(0.64, 0.74, vn(p*3.2 + 9.0));',   // a few cooler starspot regions
        '  cellL *= 1.0 + 0.07*sin(time*1.3 + a.z*40.0);',                 // the cells slowly boil
        '  vec3 hot = tint*1.7*cellL;',
        '  hot = mix(hot, vec3(1.0), smoothstep(1.0, 1.5, cellL)*0.12);',
        '  vec3 lane = tint*vec3(1.0, 0.76, 0.56)*1.0;',                   // the lanes are cooler and redder, not grey
        '  vec3 c = mix(lane, hot, edge);',
        '  float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);',
        '  c *= (1.0 - 0.22*(1.0 - mu))*vec3(1.0, mix(0.95, 1.0, mu), mix(0.88, 1.0, mu));',
        '  c += tint*pow(1.0 - mu, 5.0)*0.4;',
        '  c = vec3(1.0) - exp(-c*1.15);',                                // soft tone curve: hot cells glow towards white
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
  }
  // soft glow hugging the star's edge (works from outside and from inside the shell)
  function makeCoronaMaterial(col, strength){
    return new THREE.ShaderMaterial({
      uniforms:{ tint:{ value:new THREE.Color(col) }, k:{ value:strength } },
      transparent:true, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false,
      vertexShader:'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader:'uniform vec3 tint; uniform float k; varying vec3 vN; varying vec3 vV;\n' +
        'void main(){ float mu = abs(dot(normalize(vN), normalize(vV)));\n' +
        ' float rim = pow(1.0 - mu, 2.2)*smoothstep(0.0, 0.35, mu);\n' +
        ' gl_FragColor = vec4(mix(tint, vec3(1.0), 0.35)*rim*k, 1.0); }'
    });
  }

  // ---- hovering over a star: the star is a huge sphere below you, drawn in the ground pass so it hides whatever is behind the horizon ----
  var STAR_R_U = 1000;     // the star's radius in view units (sky bodies keep their true angular sizes)
  function starProfile(s){
    var label = s.cls === 'BH' ? 'EVENT HORIZON · NO LIGHT OF ITS OWN' : ('PHOTOSPHERE · ' + Math.round(s.T).toLocaleString('en-US') + ' K');
    return { atm:0, camH:0, label:label, zen:new THREE.Color(0, 0, 0), hor:new THREE.Color(0, 0, 0) };
  }
  function disposeStarGround(){
    var G = surfG;
    if (!G || !G.starGnd) return;
    G.gndScene.remove(G.starGnd.grp);
    G.starGnd.grp.traverse(function(o){ if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    G.starGnd = null;
  }
  function buildStarGround(s){
    var G = surfG;
    disposeStarGround();
    var isBH = s.cls === 'BH', col = isBH ? new THREE.Color(1.0, 0.62, 0.3) : s.col.clone();
    var grp = new THREE.Group();
    var sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), isBH ? new THREE.MeshBasicMaterial({ color:0x000000 }) : makeStarGroundMaterial(col));
    sphere.scale.setScalar(STAR_R_U);
    grp.add(sphere);
    var c1 = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), makeCoronaMaterial(col, isBH ? 1.7 : 1.7)); c1.scale.setScalar(STAR_R_U*1.035); grp.add(c1);
    var c2 = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), makeCoronaMaterial(col, isBH ? 0.5 : 0.95)); c2.scale.setScalar(STAR_R_U*1.6); grp.add(c2);
    var c3 = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), makeCoronaMaterial(col, isBH ? 0.2 : 0.4)); c3.scale.setScalar(STAR_R_U*2.6); grp.add(c3);
    var beamA = null, beamB = null;
    if (s.cls === 'PSR'){
      // a pulsar's two lighthouse beams, sweeping round as it spins
      var bg = new THREE.CylinderGeometry(STAR_R_U*0.22, STAR_R_U*0.015, STAR_R_U*14, 16, 1, true);
      bg.translate(0, STAR_R_U*7, 0);
      var bm = new THREE.MeshBasicMaterial({ color:0xaee0ff, transparent:true, opacity:0.22, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
      beamA = new THREE.Mesh(bg, bm); beamB = new THREE.Mesh(bg, bm);
      grp.add(beamA); grp.add(beamB);
    }
    G.gndScene.add(grp);
    G.starGnd = { grp:grp, sphere:sphere, beamA:beamA, beamB:beamB };
  }
  function updateStarGround(S, G){
    var sg = G.starGnd;
    if (!sg) return;
    sg.grp.position.set(0, -(STAR_R_U + S.alt*STAR_R_U), 0);
    // the star's surface is fixed to the star: turn it to match where you hover (latitude) and let it slowly rotate beneath you
    sg.sphere.quaternion.copy(_sv.qWL).multiply(new THREE.Quaternion().setFromAxisAngle(_sv.nA, S.clock*0.07));
    var u = sg.sphere.material.uniforms;
    if (u && u.time) u.time.value = S.clock*1.5;
    if (sg.beamA){
      var axis = _sv.nA.clone().applyMatrix4(_sv.M), p = _sv.e1.clone().applyMatrix4(_sv.M);
      var ang = S.clock*1.9, tilt = 0.9;
      var pr = p.clone().multiplyScalar(Math.cos(ang)).addScaledVector(axis.clone().cross(p), Math.sin(ang));
      var bd = axis.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(pr, Math.sin(tilt)).normalize();
      sg.beamA.quaternion.setFromUnitVectors(Y_AXIS, bd);
      sg.beamB.quaternion.setFromUnitVectors(Y_AXIS, bd.clone().negate());
    }
  }
  function enterStarView(i){
    var s = stars[i]; if (!s) return;
    if (scaleMode !== 'true') setScaleMode('true');                        // true distances, so the other bodies sit at their real angles
    if (surf) exitSurface(true);
    if (!surfG){ try { surfG = surfaceBuild(); } catch (err){ toast('SURFACE VIEW NEEDS WEBGL'); return; } }
    var G = surfG, prof = starProfile(s);
    G.terrain.visible = false;                                             // a star has no ground: the star itself is the ground
    G.uni.uAtm.value = 0;
    surf = { kind:'star', i:i, mesh:starObjs[i].mesh, prof:prof, lat:0, yaw:0, pitch:-0.62, fov:70, targetFov:70, frame:0, faced:false, alt:0.24, clock:0 };
    setSurfLat(parseFloat(surfLat.value) || 30);
    buildStarGround(s);
    viewer.classList.add('starview');
    sbAlt.value = altToPos(surf.alt); sbAltOut.textContent = fmtAlt(surf.alt);
    surfaceMakeBodies();
    viewer.classList.add('surf'); surfCap.hidden = false;
    surfBarEl.hidden = false; $('#sbExit').hidden = false; syncSurfBar();
    labelsEl.style.display = 'none'; surfTxtAt = 0;
  }

  function enterSurface(i){
    var p = planets[i]; if (!p) return;
    if (scaleMode !== 'true') setScaleMode('true');                        // the star only has the right apparent size at true scale
    if (surf) exitSurface(true);
    if (!surfG){ try { surfG = surfaceBuild(); } catch (err){ toast('SURFACE VIEW NEEDS WEBGL'); return; } }
    var G = surfG, prof = surfaceProfile('planet', p.type, p.hex), tu = G.tu, h = strHash('terrain|' + p.name + '|' + p.type);
    tu.uAmp.value = prof.amp; tu.uRidge.value = prof.ridge; tu.uCrater.value = prof.crater; tu.uCloud.value = prof.cloud; tu.uVis.value = prof.vis;
    tu.uSeedT.value.set(((h & 1023)/1023)*50, (((h >>> 10) & 1023)/1023)*50);
    tu.uC0.value.copy(prof.c0); tu.uC1.value.copy(prof.c1); tu.uC2.value.copy(prof.c2); tu.uCs.value.copy(prof.cs);
    G.uni.uAtm.value = prof.atm; G.uni.uZen.value.copy(prof.zen); G.uni.uHor.value.copy(prof.hor);
    G.terrain.visible = true;
    surf = { kind:'planet', i:i, mesh:planetObjs[i].mesh, prof:prof, lat:0, yaw:0, pitch:0.15, fov:70, targetFov:70, frame:0, faced:false };
    setSurfLat(parseFloat(surfLat.value) || 30);                           // the latitude you chose carries over to the next planet
    // start in daylight: turn the planet until the brightest star stands about 22 degrees above the horizon
    (function(){
      var P = realPositionsAU(), sd = P.stars[0].clone().sub(P.planets[i]).normalize(), m = planetObjs[i].mesh, base = m.rotation.y, best = 0, bd = 9, uu = new THREE.Vector3(), qq = new THREE.Quaternion();
      var c0 = Math.cos(surf.lat), s0 = Math.sin(surf.lat);
      for (var t = 0; t < 72; t++){
        m.rotation.y = base + t/72*TAU; m.updateWorldMatrix(true, false); m.getWorldQuaternion(qq);
        uu.set(c0, s0, 0).applyQuaternion(qq); var d = Math.abs(Math.asin(clamp(uu.dot(sd), -1, 1)) - 22*D2R);
        if (d < bd){ bd = d; best = t; }
      }
      m.rotation.y = base + best/72*TAU;
    })();
    surfaceMakeBodies();
    viewer.classList.add('surf'); surfCap.hidden = false;
    surfBarEl.hidden = false; $('#sbExit').hidden = false; syncSurfBar();
    labelsEl.style.display = 'none'; surfTxtAt = 0;
  }
  function exitSurface(quiet){
    if (!surf) return;
    var i = surf.i, kind = surf.kind || 'planet'; surf = null;
    surfaceClearBodies();
    disposeStarGround();
    viewer.classList.remove('starview');
    if (!quiet) setClean(false);
    viewer.classList.remove('surf'); surfCap.hidden = true; surfBarEl.hidden = true; $('#sbExit').hidden = true;
    labelsEl.style.display = tog.labels ? '' : 'none'; camera.up.set(0, 1, 0); renderer.autoClear = true; resize();
    if (!quiet) select({ kind:kind, i:i });
  }
  $('#bSurf').addEventListener('click', function(){
    if (surf) exitSurface();
    else if (sel && sel.kind === 'star') enterStarView(sel.i);
    else if (planets.length) enterSurface(sel && sel.kind === 'planet' ? sel.i : 0);
  });

  function updateSurface(dt, now){
    var G = surfG, S = surf, prof = S.prof;
    var w = viewer.clientWidth, h = viewer.clientHeight; if (!w || !h) return false;
    var P = realPositionsAU(), obs = S.kind === 'star' ? null : P.planets[S.i];
    // ease the zoom in log space so each wheel notch glides instead of jumping
    var lf = Math.log(S.fov), ltf = Math.log(S.targetFov);
    S.fov = Math.abs(ltf - lf) > 0.0005 ? Math.exp(lf + (ltf - lf)*(1 - Math.exp(-dt*9))) : S.targetFov;
    G.tu.uOff.value.set(0, S.lat*34377);          // latitude moves you across the planet: about 600 terrain units per degree
    var pxW = h/(2*SURF_D*Math.tan(S.fov*Math.PI/360));
    function wpx(px){ return px/pxW; }
    // observer frame: X = east, Y = up, Z = south. It turns with the planet's spin, so the sky moves.
    var cl = Math.cos(S.lat), sl = Math.sin(S.lat);
    if (S.kind === 'star'){
      // hovering over a star: "up" points away from its centre; latitude 0 lies in the planets' orbit plane (the scene is laid flat, so that plane's normal is world up)
      _sv.nA.copy(Y_AXIS);
      _sv.e1.copy(X_AXIS).cross(_sv.nA).normalize();
      _sv.up.copy(_sv.e1).multiplyScalar(cl).addScaledVector(_sv.nA, sl);
      _sv.no.copy(_sv.e1).multiplyScalar(-sl).addScaledVector(_sv.nA, cl);
      _sv.ea.crossVectors(_sv.no, _sv.up);
      obs = P.stars[S.i].clone().addScaledVector(_sv.up, stars[S.i].R*AU_PER_RSUN*(1 + S.alt));
      S.clock = (S.clock || 0) + (paused ? 0 : dt*speedMul);
    } else {
      S.mesh.getWorldQuaternion(_sv.q);
      _sv.up.set(cl, sl, 0).applyQuaternion(_sv.q); _sv.no.set(-sl, cl, 0).applyQuaternion(_sv.q); _sv.ea.set(0, 0, -1).applyQuaternion(_sv.q);
    }
    _sv.M.set(_sv.ea.x, _sv.ea.y, _sv.ea.z, 0,  _sv.up.x, _sv.up.y, _sv.up.z, 0,  -_sv.no.x, -_sv.no.y, -_sv.no.z, 0,  0, 0, 0, 1);
    _sv.qWL.setFromRotationMatrix(_sv.M);

    G.bodies.forEach(function(b){
      var pos = b.kind === 'star' ? P.stars[b.idx] : P.planets[b.idx];
      b.alive = !!pos && b.src.visible !== false; if (!b.alive) return;
      _sv.rel.copy(pos).sub(obs); b.dist = _sv.rel.length();
      if (b.dist < 1e-12){ b.alive = false; return; }
      b.dir.copy(_sv.rel).divideScalar(b.dist).applyMatrix4(_sv.M);
      b.flux = b.kind === 'star' ? b.lum/(b.dist*b.dist) : 0;
    });
    var suns = G.bodies.filter(function(b){ return b.alive && b.kind === 'star' && b.flux > 0; }).sort(function(a, b){ return b.flux - a.flux; });
    var topFlux = suns.length ? suns[0].flux : 1;
    for (var k = 0; k < 3; k++){
      var sb = suns[k], lt = G.lights[k];
      if (sb){
        var mx = Math.max(sb.color.r, sb.color.g, sb.color.b, 1e-3);
        G.sunDir[k].copy(sb.dir);
        G.sunCol[k].set(sb.color.r/mx, sb.color.g/mx, sb.color.b/mx).multiplyScalar(Math.min(1.6, Math.pow(sb.flux, 0.28)));
        lt.color.copy(sb.color); lt.intensity = 2.4*Math.pow(sb.flux/topFlux, 0.6)*Math.min(1.4, Math.pow(topFlux, 0.2)); lt.position.copy(sb.dir).multiplyScalar(100);
      } else { G.sunCol[k].set(0, 0, 0); G.sunDir[k].set(0, -1, 0); lt.intensity = 0; }
    }
    var skyDay = suns.length ? sstep(-0.1, 0.25, suns[0].dir.y) : 0;
    var amb = G.tu.uAmb.value;
    if (prof.atm > 0.001){
      amb.setRGB(0.012, 0.012, 0.014);
      suns.forEach(function(sb, k){
        if (k > 2) return;
        var dayK = sstep(-0.1, 0.25, sb.dir.y)*Math.min(1.6, Math.pow(sb.flux, 0.28)), mx = Math.max(sb.color.r, sb.color.g, sb.color.b, 1e-3);
        amb.r += prof.zen.r*(sb.color.r/mx)*dayK*0.5; amb.g += prof.zen.g*(sb.color.g/mx)*dayK*0.5; amb.b += prof.zen.b*(sb.color.b/mx)*dayK*0.5;
      });
    } else amb.setRGB(0.007, 0.008, 0.011);
    var dim = 1 - Math.min(1, skyDay*prof.atm*1.4);
    G.stars.material.opacity = 1 - Math.min(1, skyDay*prof.atm*1.1)*0.97;
    if (!S.faced){
      if (S.kind === 'star'){
        var fp = null;                    // start by looking toward the nearest planet
        G.bodies.forEach(function(b){ if (!fp && b.alive && b.kind === 'planet') fp = b; });
        if (fp){ S.yaw = Math.atan2(fp.dir.x, -fp.dir.z); S.faced = true; }
        else if (G.bodies.length) S.faced = true;
      } else if (suns.length){ S.yaw = Math.atan2(suns[0].dir.x, -suns[0].dir.z); S.faced = true; }
    }

    G.bodies.forEach(function(b){
      [b.mesh, b.ring, b.glow, b.dot, b.label].forEach(function(o){ if (o) o.visible = false; });
      if (!b.alive) return;
      if (b.hidden) return;
      var ang = Math.asin(Math.min(0.999, b.rAU/b.dist)), rW = SURF_D*Math.tan(ang), rpx = rW*pxW;
      b.mesh.position.copy(b.dir).multiplyScalar(SURF_D);
      b.mesh.scale.setScalar(Math.max(rW, 1e-3));
      b.mesh.visible = rpx > 0.45;
      if (b.kind === 'star'){
        var u = b.mesh.material.uniforms; if (u && u.time) u.time.value = now/1000;
        if (b.glow){
          var gw = Math.max(rW*2*5, wpx(34));
          b.glow.position.copy(b.mesh.position); b.glow.scale.set(gw, gw, 1);
          b.glow.material.opacity = 0.85*(1 - 0.6*Math.min(1, prof.atm)); b.glow.visible = true;
        }
      } else {
        b.src.getWorldQuaternion(_sv.qTmp);
        b.mesh.quaternion.copy(_sv.qWL).multiply(_sv.qTmp);
        if (b.ring && b.mesh.visible){
          b.ring.position.copy(b.mesh.position); b.ring.scale.copy(b.mesh.scale);
          b.ring.quaternion.copy(_sv.qWL).multiply(_sv.qTmp).multiply(_sv.qRx); b.ring.visible = true;
        }
        if (rpx < 1.4){
          var dw = wpx(3.6); b.dot.position.copy(b.mesh.position); b.dot.scale.set(dw, dw, 1);
          b.dot.material.opacity = 0.8*dim; b.dot.visible = dim > 0.02;
        }
      }
      var lw = wpx(130);
      b.label.scale.set(lw, lw*0.25, 1);
      b.label.position.copy(b.mesh.position).multiplyScalar((SURF_D - 50)/SURF_D); b.label.position.y += rW + wpx(16);
      b.label.visible = tog.labels && !surfClean && b.dir.y > -0.03 && (b.kind === 'star' || dim > 0.02 || b.mesh.visible);
    });

    var cam3 = G.cam;
    cam3.fov = S.fov; cam3.aspect = w/h; cam3.updateProjectionMatrix();
    cam3.position.set(0, prof.camH, 0);
    var cp = Math.cos(S.pitch);
    _sv.look.set(Math.sin(S.yaw)*cp, prof.camH + Math.sin(S.pitch), -Math.cos(S.yaw)*cp);
    cam3.lookAt(_sv.look);
    if (S.kind === 'star') updateStarGround(S, G);

    if (now - surfTxtAt > 800){
      surfTxtAt = now;
      surfCap.style.bottom = (surfBarEl.offsetHeight + 28) + 'px';
      if (S.kind === 'star'){
        var sObj = stars[S.i], km = Math.round(sObj.R*S.alt*695700);
        surfCap.innerHTML = '<div class="tc-tag">HOVERING ABOVE THE STAR</div><h3>' + esc(sObj.name) + '</h3>' +
          '<p>' + fmtN(km, 0) + ' km ABOVE THE SURFACE · ' + fmtN(sObj.T, 0) + ' K</p><small>ARTIST\'S IMPRESSION · ESTIMATED FIGURES</small>';
        surfInfo.textContent = prof.label + ' · HOVERING ' + fmtN(km, 0) + ' km ABOVE';
        return true;
      }
      var s0 = suns[0], p = planets[S.i], line2 = 'NO STAR IN THE SKY';
      if (s0){
        var el = Math.asin(clamp(s0.dir.y, -1, 1))/D2R, angD = 2*Math.asin(Math.min(0.999, s0.rAU/s0.dist))/D2R;
        line2 = s0.name.toUpperCase() + ' ' + (el >= 0 ? '+' : '') + el.toFixed(0) + '° · ' + (el > 6 ? 'DAY' : (el > -8 ? 'TWILIGHT' : 'NIGHT'));
        surfCap.innerHTML = '<div class="tc-tag">VIEW FROM THE SURFACE</div><h3>' + esc(dispName(p)) + '</h3>' +
          '<p>THE STAR SPANS ' + fmtN(angD, 1) + '° OF SKY · ' + fmtN(angD/0.533, 1) + '× THE SUN\'S WIDTH SEEN FROM EARTH</p>' +
          '<p>' + fmtN(p.flux, p.flux < 10 ? 1 : 0) + '× THE STARLIGHT EARTH GETS</p><small>ARTIST\'S IMPRESSION · ESTIMATED FIGURES</small>';
      }
      surfInfo.textContent = prof.label + ' · ' + line2;
    }
    return true;
  }
  function renderSurface(){
    var G = surfG, r = renderer;
    r.autoClear = false; r.clear();
    r.render(G.skyScene, G.cam); r.clearDepth(); r.render(G.gndScene, G.cam);
    r.autoClear = true;
  }

  /* ---- 4. photo with watermark ---- */
  var shotReq = false;
  function composeShot(){
    var src = renderer.domElement, W = src.width, H = src.height, f = W/viewer.clientWidth, c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d'), u = Math.max(1, W/1200), i;
    g.drawImage(src, 0, 0);
    // labels as they appear on screen
    if (tog.labels && !surf){
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      var all = starLabels.concat(planetLabels);
      all.forEach(function(el){
        if (!el._v) return;
        var isStar = el.classList.contains('star'), on = el.classList.contains('on'), hz = el.classList.contains('hz');
        g.font = (isStar ? 'bold ' : '') + Math.round((isStar ? 11 : 10)*f) + 'px Space Mono, monospace';
        g.shadowColor = '#000'; g.shadowBlur = 6*f; g.fillStyle = on ? '#ff4a4a' : (hz ? '#39d98a' : (isStar ? '#ffffff' : 'rgba(225,230,233,0.9)'));
        g.fillText(el.textContent, el._sx*f, el._sy*f);
      });
      g.shadowBlur = 0;
    }
    // bottom band with title and watermark
    var bh = 120*u, gr = g.createLinearGradient(0, H - bh*1.4, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.78)');
    g.fillStyle = gr; g.fillRect(0, H - bh*1.4, W, bh*1.4);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    var title = (S.systemName || 'Star system').toUpperCase(), sub = sel && sel.kind === 'planet' ? dispName(planets[sel.i]).toUpperCase() + ' · YEAR ' + fmtPeriod(planets[sel.i].P).toUpperCase() : planets.length + ' PLANETS · ' + (scaleMode === 'true' ? 'TRUE SCALE' : 'STYLIZED SCALE');
    if (surf) sub = surf.kind === 'star' ? 'HOVERING OVER ' + stars[surf.i].name.toUpperCase() : 'VIEW FROM THE SURFACE OF ' + dispName(planets[surf.i]).toUpperCase();
    g.fillStyle = '#ffffff'; g.font = 'bold ' + 26*u + 'px Space Mono, monospace'; g.fillText(title, 34*u, H - 60*u);
    g.fillStyle = '#9aa2a7'; g.font = 13*u + 'px Space Mono, monospace'; g.fillText(sub, 34*u, H - 36*u);
    g.fillStyle = '#ffc47a'; g.font = 10*u + 'px Space Mono, monospace'; g.fillText('FIGURES ARE ESTIMATES', 34*u, H - 18*u);
    g.textAlign = 'right';
    g.fillStyle = '#ff2b2b'; g.font = 'bold ' + 22*u + 'px Space Mono, monospace'; g.fillText('RV · RAMESHVERSE', W - 34*u, H - 50*u);
    g.fillStyle = '#c9d0d4'; g.font = 12*u + 'px Space Mono, monospace'; g.fillText('rameshverse.com/star-system-explorer', W - 34*u, H - 28*u);
    // HUD corner brackets
    g.strokeStyle = '#ff2b2b'; g.lineWidth = 3*u; var m = 16*u, L = 26*u;
    [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(function(k){ g.beginPath(); g.moveTo(k[0], k[1] + k[3]*L); g.lineTo(k[0], k[1]); g.lineTo(k[0] + k[2]*L, k[1]); g.stroke(); });
    var name = (S.systemName || 'star-system').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + (sel && sel.kind === 'planet' ? '-' + planets[sel.i].name.toLowerCase() : '') + '.png';
    c.toBlob(function(b){
      if (!b){ toast('COULD NOT SAVE IMAGE'); return; }
      var file = null; try { file = new File([b], name, { type:'image/png' }); } catch(e){}
      var touch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
      if (touch && file && navigator.canShare && navigator.canShare({ files:[file] })){
        navigator.share({ files:[file], title:(S.systemName || 'Star system') + ' · RameshVerse' }).catch(function(){});
      } else {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast('IMAGE SAVED');
      }
    }, 'image/png');
  }
  $('#bShot').addEventListener('click', function(){ shotReq = true; });

  /* ---- go ---- */
  buildList(); buildOrbits(); buildHZ(); buildSolar();
  R0 = fitRadius(); cam.r = cam.tr = R0*1.6;
  readSpeed(); resize();
  var sub = $('#sysStars'); if (sub) sub.textContent = stars.map(function(s){ return s.name; }).join(' + ');
  var q = new URLSearchParams(location.search).get('planet');
  if (q){ var qi = planets.findIndex(function(p){ return p.name.toLowerCase() === q.toLowerCase(); }); if (qi >= 0) select({ kind:'planet', i:qi }); }
  $('#loading').classList.add('gone');

  var visible = true, last = performance.now(), wp = new THREE.Vector3();
  if ('IntersectionObserver' in window) new IntersectionObserver(function(en){ visible = en[0].isIntersecting; }).observe(viewer);
  function place(el, obj, dy){
    obj.getWorldPosition(wp); wp.project(camera);
    if (wp.z > 1){ el.style.display = 'none'; el._v = false; return; }
    el.style.display = ''; el._v = true; el._sx = (wp.x*0.5 + 0.5)*viewer.clientWidth; el._sy = (-wp.y*0.5 + 0.5)*viewer.clientHeight + dy;
    el.style.transform = 'translate(' + el._sx.toFixed(1) + 'px,' + el._sy.toFixed(1) + 'px)';
  }
  var solarAnchor = new THREE.Object3D(); overlay.add(solarAnchor);

  function frame(now){
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last)/1000); last = now;
    if (!visible || document.hidden) return;
    if (!paused) tSim += dt*baseYps*speedMul*(surf ? 0.1 : 1);   // slower clock on the surface so the sky is not a blur

    placeStars();
    starObjs.forEach(function(so, i){ so.g.position.copy(starPos[i]); so.mesh.rotation.y += dt*0.12; so.mesh.material.uniforms.time.value = now/1000; });
    planets.forEach(function(p, i){
      var po = planetObjs[i], hp = hostPos(p), rp = relPos(p, rad(p.au), p.P);
      po.g.position.set(hp.x + rp.x, hp.y + rp.y, hp.z + rp.z); po.holder.position.copy(hp);
      if (!(surf && paused)) po.mesh.rotation.y += dt*(surf ? 0.06*speedMul : 0.5);   // on the surface the planet's spin (day / night) follows the speed slider and pause
    });
    if (hzMesh) hzMesh.position.set(0, 0, 0);

    // camera
    var dragging = Object.keys(ptrs).length > 0;
    if (!dragging){
      cam.azT += cam.azV*dt; cam.polT = clamp(cam.polT + cam.polV*dt, 0.04, Math.PI - 0.04);
      var damp = Math.exp(-dt*3.2); cam.azV *= damp; cam.polV *= damp;
      if (tog.spin) cam.azT += dt*0.07;
    }
    var ke = 1 - Math.exp(-dt*12);
    cam.az += (cam.azT - cam.az)*ke; cam.pol += (cam.polT - cam.pol)*ke;
    var k = 1 - Math.exp(-dt*6);
    cam.r = Math.exp(Math.log(cam.r) + (Math.log(cam.tr) - Math.log(cam.r))*(1 - Math.exp(-dt*8)));   // zoom eases in log space: same feel from 20 units down to 0.001
    if (cam.focus){ cam.focus.getWorldPosition(wp); cam.off.multiplyScalar(Math.exp(-dt*5)); cam.target.copy(wp).add(cam.off); }   // the view glides in, then is pinned exactly on the body however fast it orbits
    else cam.target.lerp(v3.set(0, 0, 0), k);
    var sp = Math.sin(cam.pol);
    camera.position.set(cam.target.x + cam.r*sp*Math.sin(cam.az), cam.target.y + cam.r*Math.cos(cam.pol), cam.target.z + cam.r*sp*Math.cos(cam.az));
    if (!surf){ camera.up.set(0, 1, 0); camera.near = Math.max(1e-5, cam.r*0.02); camera.updateProjectionMatrix(); camera.lookAt(cam.target); }
    sky.position.copy(camera.position); if (skyStarMat) skyStarMat.uniforms.time.value = now/1000;

    // star glow follows its distance from the camera so even a true-size star reads as a bright point
    starObjs.forEach(function(so){
      so.g.getWorldPosition(wp);
      var dist = camera.position.distanceTo(wp);
      // Put the glow sprites just BEHIND the star's sphere (along the line of sight). A flat sprite at the star's centre is cut by the
      // sphere's own depth on the side facing the middle of the screen, which showed up as a hard white crescent, like a second star peeking out.
      var off = so.size*1.05, k2 = (dist + off)/Math.max(dist, 1e-12);   // k2 keeps the glow the same size on screen after the shift
      v3.copy(wp).sub(camera.position).normalize().multiplyScalar(off).add(wp);
      so.g.worldToLocal(v3);
      so.sprites.forEach(function(d){ d.sp.position.copy(v3); d.sp.scale.setScalar(Math.max(so.size*d.k, dist*d.kd)*k2); });
    });
    // small dot on each planet while it is too small to see
    var halfH = renderer.domElement.height/renderer.getPixelRatio()/2, tanF = Math.tan(camera.fov*D2R/2);
    var VW = viewer.clientWidth, VH = viewer.clientHeight, pv = new THREE.Vector3();
    var starScr = starObjs.map(function(so){
      so.g.getWorldPosition(pv); var d = camera.position.distanceTo(pv), glow = Math.max(so.size*9, d*0.07); pv.project(camera);
      return { x:(pv.x*0.5 + 0.5)*VW, y:(-pv.y*0.5 + 0.5)*VH, d:d, ok:pv.z < 1, px:Math.max(so.size/(d*tanF)*halfH, 0.3*glow/(d*tanF)*halfH) };
    });
    function behindStar(obj){        // is this body farther away than a star and sitting inside that star's glare?
      obj.getWorldPosition(pv); var d = camera.position.distanceTo(pv); pv.project(camera);
      var sx = (pv.x*0.5 + 0.5)*VW, sy = (-pv.y*0.5 + 0.5)*VH;
      for (var q = 0; q < starScr.length; q++){ var s = starScr[q]; if (s.ok && d > s.d && Math.hypot(sx - s.x, sy - s.y) < s.px) return true; }
      return false;
    }
    var hiddenP = planetObjs.map(function(po){ return behindStar(po.g); });
    planetObjs.forEach(function(po, i){
      po.g.getWorldPosition(wp);
      if (po.atm) po.atm.material.uniforms.sun.value.copy(starObjs[planets[i].si].g.getWorldPosition(pv)).sub(wp);   // light direction for the atmosphere
      var d = Math.max(camera.position.distanceTo(wp), 1e-9), pxR = po.size/(d*tanF)*halfH;
      if (pxR < 3 && !hiddenP[i] && !surf){ markerPos[i*3] = wp.x; markerPos[i*3 + 1] = wp.y; markerPos[i*3 + 2] = wp.z; }
      else { markerPos[i*3] = markerPos[i*3 + 1] = markerPos[i*3 + 2] = 1e9; }
    });
    markerGeo.attributes.position.needsUpdate = true;
    var drewSurf = false;
    if (surf){ drewSurf = updateSurface(dt, now); if (drewSurf) renderSurface(); }
    if (!drewSurf) renderer.render(scene, camera);

    // labels
    if (tog.labels && !surf){
      starObjs.forEach(function(so, i){ place(starLabels[i], so.g, -(Math.min(so.size*30, 40) + 14)); });
      planetObjs.forEach(function(po, i){ place(planetLabels[i], po.g, -(Math.min(po.size*30, 40) + 12)); if (hiddenP[i]) planetLabels[i].style.display = 'none'; });
      if (tog.solar){ solarLabelEls.forEach(function(el, i){ var an = 0.6 + i*2.1, rr = rad(solarRefs[i][1]); solarAnchor.position.set(rr*Math.cos(an), 0, rr*Math.sin(an)); place(el, solarAnchor, -6); }); }
    }
    solarLabelEls.forEach(function(el){ if (!tog.solar || !tog.labels || surf) el.style.display = 'none'; });
    planetLabels.forEach(function(el, i){ if (hiddenP[i]) el._v = false; });
    if (lc.on && !surf && (lc.f++ % 3 === 0)){ computeLC(); drawLC(); if (lc.f % 45 === 1) updateLCFooter(); }
    if (shotReq){ shotReq = false; composeShot(); }
  }
  requestAnimationFrame(frame);
}
})();
