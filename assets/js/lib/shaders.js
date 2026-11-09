// Real-time shaders shared by the showreel (reel/) and the website.

const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
const mat2 RM = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p){ float v=0., a=.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p=RM*p; a*=.5; } return v/.875; }
float fbm5(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=RM*p; a*=.5; } return v/.96875; }
float ridge(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ float n=1.-abs(vnoise(p)*2.-1.); v+=a*n*n*n; p=RM*p; a*=.5; } return v/.9375; }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
`;

const MARBLING = /* glsl */ `
float marbling(vec2 q, float dens, float s){
  vec2 w = q + (vec2(fbm3(q*1.3 + s), fbm3(q*1.3 + s + 7.3)) - .5) * .55;
  float seams = ridge(w*1.05 + s*3.1);
  float fine  = ridge(w*vec2(3.0, 4.2) + 11. + s);
  float micro = ridge(w*vec2(7.5, 10.) - 4. + s*2.);
  float f = smoothstep(mix(.90,.64,dens), mix(.95,.70,dens), seams);
  f = max(f, smoothstep(mix(.93,.62,dens), mix(.97,.67,dens), fine) * smoothstep(.2,.5,fbm3(w*1.7+s)));
  f = max(f, smoothstep(mix(.96,.66,dens), mix(.99,.71,dens), micro) * .8 * smoothstep(.35,.62,fbm3(w*2.6-s)));
  float dots = smoothstep(mix(.97,.86,dens), mix(.99,.9,dens), vnoise(w*34. + s*9.));
  return clamp(max(f, dots*.75), 0., 1.);
}
`;

// Full-frame (or strip-masked) hanwoo marbling macro with wet sheen, cook and burn dissolve.
export const MARBLE_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime, uZoom, uBurn, uCook, uDens, uMode, uAlpha, uSeed;
uniform vec2 uOff;
uniform vec4 uRects[9];
uniform float uRD[9];
${NOISE}
${MARBLING}
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float dens = uDens; float a = uAlpha;
  if (uMode > .5) {
    float inside = 0.;
    for (int i = 0; i < 9; i++) {
      vec4 r = uRects[i];
      if (fc.x >= r.x && fc.x <= r.x + r.z && fc.y >= r.y && fc.y <= r.y + r.w) { inside = 1.; dens = uRD[i]; }
    }
    a *= inside;   // no early return: dFdx/dFdy below need uniform control flow
  }
  vec2 p = ((fc - .5*uRes)/uRes.y * uZoom + uOff) * 2.1;
  float s = uSeed;
  float fat = marbling(p*2.9, dens, s);
  float m = fbm3(p*5. + s*2.);
  vec3 red = mix(lin(vec3(.37,.07,.10)), lin(vec3(.55,.13,.17)), m);
  red = mix(red, lin(vec3(.60,.20,.21)), .30*smoothstep(.55,.9,fbm3(p*11. - s)));
  red = mix(red, lin(vec3(.27,.05,.07)), .30*smoothstep(.6,.95,fbm3(p*3.3 + s*4.)));
  float fib = fbm3(mat2(.83,-.56,.56,.83) * p * vec2(38., 5.));
  red *= .93 + .12*fib;
  vec3 fatc = mix(lin(vec3(.78,.70,.67)), lin(vec3(.86,.80,.76)), fbm3(p*20.+s));
  float halo = smoothstep(.0,.5,fat)*(1.-smoothstep(.5,1.,fat));
  vec3 alb = mix(red, fatc, fat);
  alb = mix(alb, lin(vec3(.70,.36,.36)), halo*.3);
  // cooking: browning crust
  vec3 brown = mix(lin(vec3(.20,.075,.035)), lin(vec3(.42,.19,.08)), fbm3(p*6.+s));
  alb = mix(alb, brown*(.8 + .5*fat), uCook);
  // lighting from a height derived from fat + fibres
  float h = fat*.5 + m*.25 + fib*.06 + .08*fbm3(p*18.);
  vec2 g = vec2(dFdx(h), dFdy(h)) * uRes.y * .02 / uZoom;
  vec3 N = normalize(vec3(-g, 1.));
  vec3 L = normalize(vec3(cos(uTime*.35)*.6 - .2, .55, .75));
  float diff = max((dot(N, L) + .4)/1.4, 0.);
  vec3 H = normalize(L + vec3(0,0,1));
  float sp = pow(max(dot(N, H), 0.), 60.) * (.6 + fat);
  float glint = pow(max(dot(normalize(N + vec3(vnoise(p*300.)-.5, vnoise(p*300.+7.)-.5, 0.)*.7), H), 0.), 400.) * smoothstep(.5,.8,vnoise(p*60.));
  vec3 col = alb * (diff * 2.0 + .22) + vec3(1., .95, .9) * (sp * .35 + glint * 1.6) * (1. - uCook*.5);
  col += alb * lin(vec3(1.,.3,.22)) * .25 * (1. - diff);
  col = pow(aces(col), vec3(1./2.2));
  // burn dissolve (bottom first) with glowing edge
  if (uBurn > 0.) {
    float bn = fbm5(fc/uRes.y*3.2 + 1.7)*.7 + (1. - fc.y/uRes.y)*.5;
    float th = uBurn*1.35 - .12;
    float keep = smoothstep(th, th + .012, bn);
    float glow = smoothstep(th + .09, th, bn) * keep;
    col = mix(col, vec3(.06,.025,.015), smoothstep(th + .14, th + .03, bn));
    col += vec3(1., .5, .12)*glow*2.2;
    a *= keep;
  }
  o = vec4(col * a, a);
}
`;

// Fire. uMode 0: flames rising from the bottom of frame. 1: top-down coal pit (under a grill).
export const FIRE_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime, uIntensity, uHeight, uBed, uMode, uAlpha;
${NOISE}
vec3 ramp(float x){
  x = clamp(x, 0., 1.5);
  vec3 c = mix(vec3(0.), vec3(.32,.025,.0), smoothstep(.0,.25,x));
  c = mix(c, vec3(.85,.16,.02), smoothstep(.22,.5,x));
  c = mix(c, vec3(1.,.50,.08), smoothstep(.48,.78,x));
  c = mix(c, vec3(1.,.86,.55), smoothstep(.76,1.05,x));
  return mix(c, vec3(1.), smoothstep(1.05, 1.5, x));
}
float vorEdge(vec2 x){
  vec2 n = floor(x), f = fract(x); float md = 8., md2 = 8.;
  for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){ vec2 g = vec2(i,j); vec2 r = g + hash22(n+g) - f; float d = dot(r,r);
    if (d < md) { md2 = md; md = d; } else if (d < md2) md2 = d; }
  return sqrt(md2) - sqrt(md);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uTime;
  vec3 col;
  if (uMode < .5) {
    vec2 p = vec2((gl_FragCoord.x - .5*uRes.x)/uRes.y, uv.y);
    vec2 fp = vec2(p.x*3.0, p.y*2.0 - t*1.5);
    float n1 = fbm5(fp + (fbm3(fp*1.3 + vec2(t*.2, -t*.8)) - .5)*1.6);
    float n2 = fbm3(vec2(p.x*7., p.y*5. - t*3.2));
    float h = uv.y / max(uHeight, .001);
    float flame = (1. - h)*1.25 + (n1 - .5)*1.35 + (n2 - .5)*.4;
    flame = pow(clamp(flame, 0., 1.4), 1.5) * uIntensity;
    col = ramp(flame);
    if (uBed > 0.) {
      float bed = smoothstep(uBed, uBed*.35, uv.y);
      float e = vorEdge(vec2(p.x*7., uv.y*26.) + vec2(0., t*.05));
      float glowC = smoothstep(.16, .0, e) * (.55 + .45*sin(t*3. + hash12(floor(vec2(p.x*7., uv.y*26.)))*20.));
      vec3 coal = mix(vec3(.03,.02,.02), ramp(.55 + .4*glowC), glowC);
      col = mix(col, max(col, coal), bed);
    }
  } else {
    vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
    float e = vorEdge(p*5.5 + vec2(0., t*.03));
    vec2 cell = floor(p*5.5);
    float heat = .45 + .35*fbm3(p*2. + t*.15) + .2*sin(t*2.3 + hash12(cell)*30.);
    float cracks = smoothstep(.22, .0, e);
    float flick = fbm5(p*3. + vec2(t*.3, -t*.6));
    float v = mix(heat*.55, 1.05, cracks) * (.75 + .5*flick) * uIntensity;
    col = ramp(v);
    float flame = smoothstep(.55, .95, fbm5(p*2.2 + vec2(0., -t*1.2)) + .25*flick);
    col += vec3(1., .55, .15) * flame * .6 * uIntensity;
  }
  o = vec4(col * uAlpha, uAlpha);
}
`;

// Final grade: chromatic aberration, mip bloom, flash, vignette, grain, fade.
export const POST_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime, uAberr, uBloom, uGrain, uVig, uFade, uFlash;
uniform vec3 uFlashCol;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 uv = vUv; vec2 d = uv - .5;
  vec2 da = d * vec2(uRes.x/uRes.y, 1.);
  float r2 = dot(da, da);
  vec2 off = d * uAberr * (.4 + r2*1.5);
  vec3 col = vec3(texture(uTex, uv + off).r, texture(uTex, uv).g, texture(uTex, uv - off).b);
  vec3 b = max(textureLod(uTex, uv, 3.).rgb - .55, 0.) * .6
         + max(textureLod(uTex, uv, 4.5).rgb - .45, 0.) * .9
         + max(textureLod(uTex, uv, 6.).rgb - .35, 0.) * 1.1;
  col += b * uBloom;
  col += uFlashCol * uFlash;
  col *= 1. - uVig * smoothstep(.12, 1.05, r2);
  float g = hash12(gl_FragCoord.xy + fract(uTime*13.37)*vec2(431., 173.)) - .5;
  col += g * uGrain * (1.15 - dot(col, vec3(.333)));
  o = vec4(col * uFade, 1.);
}
`;
