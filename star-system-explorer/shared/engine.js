/* Star System Explorer — shared 3D system viewer (Three.js r128)
 * A system page loads this file and a system JSON in the Star System Creator preset format:
 *   <body data-json="system.json"> ... <script src="../shared/engine.js"></script>
 * An inline <script type="application/json" id="system-json"> is used instead if present (works from file://).
 * Same maths as the creator: sky-plane reference frame, Kepler motion, flux-based habitable zone (0.53-1.1 x Earth).
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
function atmosphereMaterial(col){
  return new THREE.ShaderMaterial({
    uniforms:{ tint:{ value:col } }, transparent:true, side:THREE.BackSide, blending:THREE.AdditiveBlending, depthWrite:false,
    vertexShader:'varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }',
    fragmentShader:'uniform vec3 tint; varying vec3 vN; varying vec3 vV; void main(){ float k=pow(clamp(0.78-dot(normalize(vN),normalize(vV)),0.0,1.0),2.4); gl_FragColor=vec4(tint,1.0)*k*0.42; }'
  });
}

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
    var saxis = new THREE.Group(); saxis.rotation.z = 0.12; saxis.add(mesh);
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
    var mat = new THREE.MeshStandardMaterial({ map:planetTexture(p.type, p.hex, i + 1, 2), roughness:0.95, metalness:0 });
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
    mesh.scale.setScalar(size);
    var axis = new THREE.Group(); axis.rotation.z = (8 + 22*((i*0.618 + 0.3) % 1))*D2R; axis.rotation.x = (i*0.9)%1.2;   // each planet leans its own way
    axis.add(mesh); grp.add(axis);
    var atm = null, tilt = null;
    if (p.type !== 'rocky' && p.type !== 'dwarf' && p.type !== 'superearth'){
      atm = new THREE.Mesh(new THREE.SphereGeometry(1.14, 32, 20), atmosphereMaterial(new THREE.Color(p.hex).lerp(new THREE.Color(1, 1, 1), 0.3)));
      atm.scale.setScalar(size); grp.add(atm);
    }
    if (p.hasRing){
      var ri = 1.55, ro = 2.6, rg = new THREE.RingGeometry(ri, ro, 64);
      fixRingUVs(rg, ri, ro);
      var ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map:ringTexture(p.hex, i + 1), side:THREE.DoubleSide, transparent:true, depthWrite:false }));
      tilt = new THREE.Group(); ring.rotation.x = -Math.PI/2; tilt.add(ring); tilt.rotation.z = 0.45; tilt.scale.setScalar(size); grp.add(tilt);
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
    hzMesh = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 160, 1), new THREE.MeshBasicMaterial({ color:0x39d98a, transparent:true, opacity:0.05, side:THREE.DoubleSide, depthWrite:false }));
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
      po.line.material.opacity = on ? 0.95 : (planets[i].hz ? 0.5 : 0.2);
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
  bindToggle('#tLabels', 'labels', function(){ labelsEl.style.display = tog.labels ? '' : 'none'; });
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
    else if (k === 'a') $('#tSpin').click(); else if (k === 'r') resetView(); else if (k === 'l') $('#tLabels').click(); else if (k === 'o') $('#tOrbits').click();
    else if (k === 'h') $('#tHZ').click(); else if (k === 't') $('#tLC').click(); else if (k === 'escape'){ if (surf) exitSurface(); else select(null); }
  });

  // pointer navigation: drag = rotate, wheel / pinch = zoom, tap = pick
  var ptrs = {}, moved = 0;
  var lastMoveT = 0;
  cv.addEventListener('pointerdown', function(e){ if (surf) return; cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x:e.clientX, y:e.clientY }; moved = 0; cam.azV = cam.polV = 0; lastMoveT = e.timeStamp; });
  cv.addEventListener('pointermove', function(e){
    var p = ptrs[e.pointerId]; if (!p) return;
    var ids = Object.keys(ptrs);
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
    if (single && moved < 6 && e.type === 'pointerup') pick(e.clientX, e.clientY);
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function(e){ e.preventDefault(); if (surf) return; var dy = e.deltaY*(e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1); dy = clamp(dy, -150, 150); cam.tr = clamp(cam.tr*Math.exp(dy*0.0014), minR(), 120); }, { passive:false });
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
      '<button class="b" id="bShot" type="button" title="Save this view as an image with a watermark">PHOTO</button>';
    ctr.insertBefore(grp, anchor ? anchor.parentNode : null);
    viewer.insertAdjacentHTML('beforeend',
      '<div class="lc" id="lcPanel" hidden><div class="lc-h"><span>LIGHT CURVE</span><i>AS SEEN FROM EARTH · LIVE</i></div><canvas id="lcCv"></canvas><div class="lc-f" id="lcF"></div></div>' +
      '<div class="surfcap" id="surfCap" hidden></div>' +
      '<button class="b stop" id="bExitSurf" type="button" hidden>✕ EXIT SURFACE VIEW</button>' +
      '<div class="toast" id="toast" role="status"></div>');
  })();
  var surfCap = $('#surfCap'), lcPanel = $('#lcPanel'), lcCv = $('#lcCv'), lcF = $('#lcF'), toastEl = $('#toast');

  function toast(msg){ toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function(){ toastEl.classList.remove('on'); }, 2400); }

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

  /* ---- 3. view from a planet's surface ---- */
  var sv1 = new THREE.Vector3(), sv2 = new THREE.Vector3(), sv3 = new THREE.Vector3(), svN = new THREE.Vector3(), surfTxtAt = 0;
  function enterSurface(i){
    if (scaleMode !== 'true') setScaleMode('true');                        // the star only has the right apparent size at true scale
    surf = { i:i };
    viewer.classList.add('surf'); $('#bExitSurf').hidden = false; surfCap.hidden = false;
    var pm = planetObjs[i].mesh;
    surf.geo0 = pm.geometry; surf.map0 = pm.material.map;
    pm.geometry = new THREE.SphereGeometry(1, 512, 320);                  // fine mesh so the horizon is a smooth curve, not facets
    pm.material.map = planetTexture(planets[i].type, planets[i].hex, i + 1, 8); pm.material.needsUpdate = true;
    if (planetObjs[i].atm) planetObjs[i].atm.visible = false;
    planetObjs.forEach(function(o){ if (o.line) o.line.visible = false; }); if (hzMesh) hzMesh.visible = false; overlay.visible = false;
    labelsEl.style.display = 'none'; camera.fov = 70; camera.updateProjectionMatrix(); surfTxtAt = 0;
  }
  function exitSurface(quiet){
    if (!surf) return;
    var i = surf.i, surf0 = surf; surf = null;
    viewer.classList.remove('surf'); $('#bExitSurf').hidden = true; surfCap.hidden = true;
    var pm2 = planetObjs[i].mesh;
    pm2.geometry.dispose(); pm2.geometry = surf0.geo0; if (pm2.material.map) pm2.material.map.dispose(); pm2.material.map = surf0.map0; pm2.material.needsUpdate = true;
    if (planetObjs[i].atm) planetObjs[i].atm.visible = true;
    if (hzMesh) hzMesh.visible = tog.hz; overlay.visible = tog.solar; applySelectionStyle();
    labelsEl.style.display = tog.labels ? '' : 'none'; camera.up.set(0, 1, 0); resize();
    if (!quiet) select({ kind:'planet', i:i });
  }
  $('#bExitSurf').addEventListener('click', function(){ exitSurface(); });
  function surfaceCamera(now){
    var po = planetObjs[surf.i], p = planets[surf.i];
    po.g.getWorldPosition(sv1); starObjs[0].g.getWorldPosition(sv2);
    sv3.copy(sv2).sub(sv1); var dist = sv3.length(); sv3.divideScalar(dist);                 // unit vector from the planet to its star
    svN.set(0, 1, 0).addScaledVector(sv3, -sv3.y);                                            // orbit-plane "north", made perpendicular to the star direction
    if (svN.lengthSq() < 1e-8) svN.set(1, 0, 0);
    svN.normalize();
    var z = (78 + 3*Math.sin(now/5000))*D2R;                                                  // the star sits low in the sky, like a sunrise
    svN.multiplyScalar(Math.sin(z)).addScaledVector(sv3, Math.cos(z)).normalize();            // local "up" at the observer's spot
    camera.position.copy(sv1).addScaledVector(svN, po.size*1.02);
    camera.up.copy(svN); camera.near = Math.max(1e-9, po.size*0.004); camera.far = 1600; camera.updateProjectionMatrix();
    camera.lookAt(sv2);
    if (now - surfTxtAt > 800){
      surfTxtAt = now;
      var aAU = dist/KU, ang = 2*Math.atan(RsAU/aAU)/D2R;
      surfCap.innerHTML = '<div class="tc-tag">VIEW FROM THE SURFACE</div><h3>' + esc(dispName(p)) + '</h3>' +
        '<p>THE STAR SPANS ' + fmtN(ang, 1) + '° OF SKY · ' + fmtN(ang/0.533, 1) + '× THE SUN\'S WIDTH SEEN FROM EARTH</p>' +
        '<p>' + fmtN(p.flux, p.flux < 10 ? 1 : 0) + '× THE STARLIGHT EARTH GETS</p><small>ARTIST\'S IMPRESSION · ESTIMATED FIGURES</small>';
    }
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
    if (surf) sub = 'VIEW FROM THE SURFACE OF ' + dispName(planets[surf.i]).toUpperCase();
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
    if (!paused) tSim += dt*baseYps*speedMul;

    placeStars();
    starObjs.forEach(function(so, i){ so.g.position.copy(starPos[i]); so.mesh.rotation.y += dt*0.12; so.mesh.material.uniforms.time.value = now/1000; });
    planets.forEach(function(p, i){
      var po = planetObjs[i], hp = hostPos(p), rp = relPos(p, rad(p.au), p.P);
      po.g.position.set(hp.x + rp.x, hp.y + rp.y, hp.z + rp.z); po.holder.position.copy(hp);
      po.mesh.rotation.y += dt*0.5;
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
    if (surf) surfaceCamera(now);
    else { camera.up.set(0, 1, 0); camera.near = Math.max(1e-5, cam.r*0.02); camera.updateProjectionMatrix(); camera.lookAt(cam.target); }
    sky.position.copy(camera.position); if (skyStarMat) skyStarMat.uniforms.time.value = now/1000;

    // star glow follows its distance from the camera so even a true-size star reads as a bright point
    starObjs.forEach(function(so){
      so.g.getWorldPosition(wp);
      var dist = camera.position.distanceTo(wp);
      so.sprites.forEach(function(d){ d.sp.scale.setScalar(Math.max(so.size*d.k, dist*d.kd)); });
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
      var d = Math.max(camera.position.distanceTo(wp), 1e-9), pxR = po.size/(d*tanF)*halfH;
      if (pxR < 3 && !hiddenP[i] && !surf){ markerPos[i*3] = wp.x; markerPos[i*3 + 1] = wp.y; markerPos[i*3 + 2] = wp.z; }
      else { markerPos[i*3] = markerPos[i*3 + 1] = markerPos[i*3 + 2] = 1e9; }
    });
    markerGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);

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
