// CG food-photography renderer.
// An overhead height-field "flat-lay" shader: every object (slate plate, hanwoo
// medallions, star-cut shiitake, king-oyster rounds, asparagus, fern, grill bars)
// is a height function. Lighting = soft height-field shadows + AO + GGX specular
// + wrap/subsurface diffuse for the meat. Rendered offline into stills that the
// showreel and the website both use (see tools/bake.html).
//
// Modes:
//   0  안심 plate  (three 1++ tenderloin medallions on ridged black slate)
//   1  등심 plate  (꽃등심 swirl slices)
//   2  grill, whole medallions — uCook 0 = raw face up, 1 = seared face up
//   3  grill, bite-size cubes showing the rosy cut face

export const FOOD_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uMode;
uniform float uCook;
uniform float uExtent;   // half height of the view, world units
uniform vec2 uCenter;
uniform float uSS;       // supersamples per axis
uniform vec3 uLight;     // key light direction (z = towards camera)
uniform float uTilt;     // camera tilt from vertical (radians)

#define PI 3.14159265

// ---------------------------------------------------------------- noise
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
const mat2 RM = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p){ float v=0., a=.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p=RM*p; a*=.5; } return v/.875; }
float fbm5(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=RM*p; a*=.5; } return v/.96875; }
float ridge(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ float n=1.-abs(vnoise(p)*2.-1.); v+=a*n*n*n; p=RM*p; a*=.5; } return v/.9375; }

vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

// ------------------------------------------------------------- marbling
// fat amount (0..1) of a hanwoo cross-section. dens: 0 lean .. 1 = No.9
float marbling(vec2 q, float dens, float s){
  vec2 w = q + (vec2(fbm3(q*1.3 + s), fbm3(q*1.3 + s + 7.3)) - .5) * .55;
  float seams = ridge(w*1.05 + s*3.1);
  float fine  = ridge(w*vec2(3.0, 4.2) + 11. + s);
  float micro = ridge(w*vec2(7.5, 10.) - 4. + s*2.);
  float f = smoothstep(mix(.90,.64,dens), mix(.95,.70,dens), seams);
  f = max(f, smoothstep(mix(.93,.62,dens), mix(.97,.67,dens), fine) * smoothstep(.2,.5,fbm3(w*1.7+s)));
  f = max(f, smoothstep(mix(.96,.66,dens), mix(.99,.71,dens), micro) * .8 * smoothstep(.35,.62,fbm3(w*2.6-s)));
  float dots = smoothstep(mix(.97,.86,dens), mix(.99,.9,dens), vnoise(w*34. + s*9.));
  f = max(f, dots*.75);
  return clamp(f, 0., 1.);
}

// --------------------------------------------------------------- shapes
// rounded puck profile: d = inside distance from outline, H = height, e = edge radius
float puck(float d, float H, float e){
  if (d <= 0.) return -1.;
  float k = clamp(d/e, 0., 1.);
  return H - e + e*sqrt(1. - (1.-k)*(1.-k));
}
// wobbly outline radius
float wob(float ang, float r, float s, float amt){
  return r * (1. + amt*(.5*sin(2.*ang + s*3.) + .35*sin(3.*ang + s*7.) + .25*(vnoise(vec2(ang*1.7 + s*13., s)) - .5)*2.));
}

// object ids
#define ID_LINEN 0
#define ID_SLATE 1
#define ID_MEAT 2
#define ID_SHIITAKE 3
#define ID_OYSTER 4
#define ID_ASPAR 5
#define ID_FERN 6
#define ID_GRILL 7
#define ID_HOLE 8
#define ID_CUBE 9
#define ID_TABLE 10

struct Hit { float h; int id; vec4 info; };

void take(inout Hit best, float h, int id, vec4 info){ if (h > best.h) { best.h = h; best.id = id; best.info = info; } }

const float PLATE_H = .055;

// medallion: c center, r radius, s seed. info = (local.xy, inside-distance/r, seed)
void medallion(inout Hit b, vec2 p, vec2 c, float r, float s, float H, float base, bool detail){
  vec2 q = p - c; if (dot(q,q) > r*r*1.35) return;
  float a = atan(q.y, q.x); float rr = wob(a, r, s, .07);
  float d = rr - length(q);
  if (d <= 0.) return;
  float h = puck(d, H, .05);
  if (detail) h += .006*(fbm3(q*9. + s) - .5) + .012*(1. - dot(q,q)/(r*r)) + (uMode > 1.5 ? uCook*.006*(fbm3(q*28. + s) - .5) : 0.);
  take(b, base + h, ID_MEAT, vec4(q / r, d / r, s));
}
// sirloin slice (elongated, swirl). info = (local.xy, inside dist, seed)
void slice(inout Hit b, vec2 p, vec2 c, vec2 rad, float ang, float s, bool detail){
  vec2 q = rot(ang) * (p - c); vec2 qn = q / rad; if (dot(qn,qn) > 1.5) return; float a = atan(qn.y, qn.x);
  float rr = 1. + .10*sin(2.*a + s*5.) + .07*sin(3.*a + s) + .08*(vnoise(vec2(a*2. + s*9., s)) - .5);
  // notch, like the cut of 꽃등심
  rr -= .28*exp(-pow((a - (1.9 + s*.3))*3.2, 2.));
  float d = (rr - length(qn)) * min(rad.x, rad.y);
  if (d <= 0.) return;
  float h = puck(d, .05, .03);
  if (detail) h += .004*(fbm3(q*12. + s) - .5);
  take(b, PLATE_H + h, ID_MEAT, vec4(q / rad.y, d / rad.y, s + 10.));
}
void shiitake(inout Hit b, vec2 p, vec2 c, float r, float s, bool detail){
  vec2 q = rot(s) * (p - c); if (dot(q,q) > r*r*1.25) return; float a = atan(q.y, q.x); float rr = wob(a, r, s, .05);
  float rho = length(q); float d = rr - rho;
  if (d <= 0.) return;
  float k = rho / rr;
  float h = .085 * sqrt(max(1. - k*k*k*.95, 0.)) + .01;
  float cut = 0.;
  // star cut: 6 tapering arms
  float aa = mod(a + PI/6., PI/3.) - PI/6.;
  float wArm = .018 * (1. - k/.78);
  if (k < .78 && abs(aa)*rho < wArm) cut = 1.;
  if (k < .12) cut = 1.;
  if (detail) h += .003*(fbm3(q*30. + s) - .5) - cut*.003;
  take(b, PLATE_H + h, ID_SHIITAKE, vec4(q / rr, cut, k));
}
void oyster(inout Hit b, vec2 p, vec2 c, float r, float s, bool detail){
  vec2 q = p - c; if (dot(q,q) > r*r*1.2) return; float a = atan(q.y, q.x); float rr = wob(a, r, s, .03);
  float d = rr - length(q);
  if (d <= 0.) return;
  float h = puck(d, .05, .012);
  if (detail) h += .0025*(fbm3(q*40. + s) - .5);
  take(b, PLATE_H + h, ID_OYSTER, vec4(q / rr, d, s));
}
void asparagus(inout Hit b, vec2 p, vec2 A, vec2 B, float s, bool detail){
  vec2 pa = p - A, ba = B - A; float t = clamp(dot(pa, ba)/dot(ba, ba), 0., 1.);
  float r = mix(.026, .021, t);
  r *= mix(1., smoothstep(1.005, .90, t) * 1.12, step(.9, t));
  float d = length(pa - ba*t);
  if (d >= r) return;
  float h = sqrt(r*r - d*d);
  float side = sign(pa.x*ba.y - pa.y*ba.x);
  if (detail) h += .0015*sin(t*90. + side);
  take(b, PLATE_H + h, ID_ASPAR, vec4(t, d / r * side, s, 0.));
}
void fern(inout Hit b, vec2 p, vec2 C, float R, float a0, float a1, float s, bool detail){
  vec2 rel = p - C; float rho0 = length(rel); if (abs(rho0 - R) > .07) return; float ang = atan(rel.y, rel.x);
  float u = (ang - a0) / (a1 - a0);
  if (u < 0. || u > 1.05) return;
  float rho = length(rel); float d = rho - R;
  float S = u * abs(a1 - a0) * R;
  float L = .095 * (1. - u*.75) + .012;
  float stem = .0055 * (1. - u*.6);
  float leaf = 0.;
  float dd = abs(d);
  float sp = .036;
  float kk = floor(S/sp + .5);
  float uu = S - kk*sp - dd*.55;             // forward slant
  float e = pow(uu/(sp*.42), 2.) + pow((dd - L*.5)/(L*.5), 2.);
  if (e < 1. && dd < L && u < 1.) leaf = 1. - e;
  float isStem = step(dd, stem) * step(u, 1.);
  if (leaf <= 0. && isStem <= 0.) return;
  float h = PLATE_H + .006 + .004*leaf + isStem*.004;
  take(b, h, ID_FERN, vec4(u, leaf, isStem, d));
}

// grill bars: vertical, with round profile; holes in between
void grill(inout Hit b, vec2 p, bool detail){
  float rr = length(p);
  if (rr > 1.36) { take(b, .0, ID_TABLE, vec4(p, 0, 0)); return; }
  if (rr > 1.22) { // rim
    float d = min(rr - 1.22, 1.36 - rr);
    take(b, .02 + .035*sqrt(clamp(d/.07,0.,1.)), ID_GRILL, vec4(p, 1., 0)); return;
  }
  float pitch = .15, hw = .046;
  float x = p.x + .03;
  float k = floor(x/pitch + .5); float dx = x - k*pitch;
  if (abs(dx) < hw) {
    float h = .04 * sqrt(1. - pow(dx/hw, 2.));
    if (detail) h += .0025*(fbm3(p*vec2(30.,6.) + k) - .5);
    take(b, h, ID_GRILL, vec4(p, 0., dx/hw));
  } else {
    take(b, -0.2, ID_HOLE, vec4(p, 0, dx));
  }
}
// rounded cube (cut face up)
void cube(inout Hit b, vec2 p, vec2 c, float hs, float ang, float s, bool detail){
  vec2 q = rot(ang) * (p - c); if (dot(q,q) > hs*hs*2.2) return;
  vec2 dq = abs(q) - vec2(hs - .03);
  float sd = length(max(dq, 0.)) + min(max(dq.x, dq.y), 0.) - .03;   // signed dist, negative inside
  float d = -sd;
  if (d <= 0.) return;
  float h = puck(d, .15, .035);
  if (detail) h += .004*(fbm3(q*14. + s) - .5);
  take(b, .04 + h, ID_CUBE, vec4(q / hs, d / hs, s));
}

Hit scene(vec2 p, bool detail){
  Hit b; b.h = -1.; b.id = ID_LINEN; b.info = vec4(0);
  int mode = int(uMode + .5);
  if (mode <= 1) {
    // linen with soft folds
    float lh = detail ? .015*fbm3(p*1.2 + 3.) + .0015*fbm3(p*6.) : .008;
    take(b, lh, ID_LINEN, vec4(p, 0, 0));
    float r = length(p);
    if (r < 1.0) {
      float d = 1.0 - r;
      float h = puck(d, PLATE_H, .016);
      if (detail) {
        float g = p.y*15. + fbm3(p*1.8)*4.2 + fbm3(p*6.)*.6;
        float rid = 1. - abs(fract(g) - .5)*2.;
        h += .0045*pow(rid, 2.5) * smoothstep(0., .06, d);
      }
      take(b, h, ID_SLATE, vec4(p, d, 0));
    }
    if (mode == 0) {
      medallion(b, p, vec2(-.37, .19), .245, 1., .16, PLATE_H, detail);
      medallion(b, p, vec2(.19, .37), .25, 2., .155, PLATE_H, detail);
      medallion(b, p, vec2(.30, -.19), .24, 3., .165, PLATE_H, detail);
      shiitake(b, p, vec2(-.47, -.33), .128, .3, detail);
      shiitake(b, p, vec2(-.16, -.50), .118, 1.1, detail);
      oyster(b, p, vec2(.70, .14), .088, 4., detail);
      oyster(b, p, vec2(.63, .37), .082, 5., detail);
      asparagus(b, p, vec2(.06, -.83), vec2(.80, -.42), 1., detail);
      asparagus(b, p, vec2(.13, -.90), vec2(.84, -.53), 2., detail);
      fern(b, p, vec2(-.12, -.05), .76, 1.78, 2.72, 1., detail);
    } else {
      slice(b, p, vec2(-.20, .44), vec2(.37, .19), -.25, 1., detail);
      slice(b, p, vec2(.34, .12), vec2(.35, .19), 1.15, 2., detail);
      slice(b, p, vec2(-.10, -.20), vec2(.38, .20), -.05, 3., detail);
      oyster(b, p, vec2(-.62, -.10), .09, 1., detail);
      oyster(b, p, vec2(-.48, -.50), .085, 2., detail);
      shiitake(b, p, vec2(-.10, -.66), .12, .7, detail);
      asparagus(b, p, vec2(.28, -.78), vec2(.86, -.28), 3., detail);
      asparagus(b, p, vec2(.20, -.82), vec2(.80, -.36), 4., detail);
      fern(b, p, vec2(-.05, .25), .74, 2.05, 2.85, 2., detail);
    }
  } else {
    grill(b, p, detail);
    if (mode == 2) {
      medallion(b, p, vec2(-.31, .06), .27, 1., .15, .03, detail);
      medallion(b, p, vec2(.33, -.03), .26, 2., .155, .03, detail);
    } else {
      cube(b, p, vec2(-.44, .30), .105, .12, 1., detail);
      cube(b, p, vec2(-.14, .36), .1, -.08, 2., detail);
      cube(b, p, vec2(.17, .33), .105, .2, 3., detail);
      cube(b, p, vec2(-.47, -.02), .1, -.15, 4., detail);
      cube(b, p, vec2(-.16, .04), .108, .05, 5., detail);
      cube(b, p, vec2(.16, .01), .1, -.22, 6., detail);
      cube(b, p, vec2(.45, .12), .1, .1, 7., detail);
      cube(b, p, vec2(-.30, -.32), .102, .18, 8., detail);
      cube(b, p, vec2(.01, -.30), .1, -.05, 9., detail);
      cube(b, p, vec2(.32, -.27), .105, .25, 10., detail);
      cube(b, p, vec2(.50, -.18), .095, -.3, 11., detail);
    }
  }
  return b;
}

float softShadow(vec2 p, float h0){
  vec2 ld = normalize(uLight.xy); float slope = uLight.z / length(uLight.xy);
  float res = 1., t = .006;
  for (int i = 0; i < 30; i++) {
    vec2 q = p + ld*t;
    float H = scene(q, false).h;
    float rayH = h0 + slope*t;
    res = min(res, 9.*(rayH - H)/t + .02);
    if (res < 0.) break;
    t += .006 + t*.09;
    if (t > .9) break;
  }
  return clamp(res, 0., 1.);
}
float ambientOcc(vec2 p, float h0){
  float occ = 0.;
  for (int i = 0; i < 8; i++) {
    float a = float(i)*2.399 + .5; float r = .02 + .025*float(i);
    float H = scene(p + vec2(cos(a), sin(a))*r, false).h;
    occ += clamp((H - h0)/r, 0., 1.) * (1. - float(i)/9.);
  }
  return clamp(1. - occ*.16, 0., 1.);
}

float ggx(vec3 N, vec3 V, vec3 L, float rough, float F0){
  vec3 H = normalize(V + L);
  float NoH = max(dot(N,H),0.), NoL = max(dot(N,L),0.), NoV = max(dot(N,V),1e-3), VoH = max(dot(V,H),0.);
  float a = rough*rough, a2 = a*a; float dd = NoH*NoH*(a2-1.)+1.; float D = a2/(PI*dd*dd);
  float k = (rough+1.)*(rough+1.)/8.; float G = (NoL/(NoL*(1.-k)+k))*(NoV/(NoV*(1.-k)+k));
  float F = F0 + (1.-F0)*pow(1.-VoH, 5.);
  return D*G*F/(4.*NoV + 1e-4);
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }

// meat albedo for a seed/position; returns albedo, writes fat & rough
vec3 meatAlbedo(vec2 q, float dens, float s, out float fat){
  fat = marbling(q*2.9, dens, s);
  float m = fbm3(q*5. + s*2.);
  vec3 red = mix(lin(vec3(.37,.07,.10)), lin(vec3(.55,.13,.17)), m);
  red = mix(red, lin(vec3(.60,.20,.21)), .30*smoothstep(.55,.9,fbm3(q*11. - s)));
  red = mix(red, lin(vec3(.27,.05,.07)), .30*smoothstep(.6,.95,fbm3(q*3.3 + s*4.)));
  float fib = vnoise(rot(.6 + s) * q * vec2(140., 9.));
  red *= .90 + .18*fib;
  vec3 fatc = mix(lin(vec3(.78,.70,.67)), lin(vec3(.86,.80,.76)), fbm3(q*20.+s));
  float halo = smoothstep(.0, .5, fat) * (1. - smoothstep(.5, 1., fat));
  vec3 c = mix(red, fatc, fat);
  c = mix(c, lin(vec3(.70,.36,.36)), halo*.30);
  return c;
}
vec3 searAlbedo(vec2 q, float s, float marks){
  float n = fbm5(q*4.5 + s);
  vec3 c = mix(lin(vec3(.20,.075,.035)), lin(vec3(.40,.17,.07)), smoothstep(.25,.8,n));
  c = mix(c, lin(vec3(.56,.28,.10)), .5*smoothstep(.6,.9,fbm3(q*9.+s)));
  c = mix(c, lin(vec3(.10,.04,.02)), .35*smoothstep(.6,.9,fbm3(q*22.-s)));
  c = mix(c, lin(vec3(.045,.018,.01)), marks);
  return c;
}

vec4 render(vec2 sp){
  float ct = cos(uTilt), st = sin(uTilt);
  // march the view ray down through the height field
  float h = .32, prev = h; vec2 p = sp; bool hit = false;
  for (int i = 0; i < 90; i++) {
    p = vec2(sp.x, (sp.y - h*st)/ct);
    float H = scene(p, false).h;
    if (H >= h) { hit = true; break; }
    prev = h;
    h -= clamp((h - H)*.45, .0012, .02);
    if (h < -.22) break;
  }
  if (hit) {
    float lo = h, hi = prev;
    for (int i = 0; i < 6; i++) {
      float mid = .5*(lo + hi); vec2 pm = vec2(sp.x, (sp.y - mid*st)/ct);
      if (scene(pm, false).h >= mid) lo = mid; else hi = mid;
    }
    h = lo; p = vec2(sp.x, (sp.y - h*st)/ct);
  }
  Hit hc = scene(p, true);
  int mode = int(uMode + .5);
  if (hc.id == ID_HOLE) return vec4(0.);
  float hCoarse = scene(p, false).h;
  float wall = step(.008, hCoarse - h);
  // height fields can't overhang: anything seen below the grill bars is the fire pit
  if (mode >= 2 && wall > .5 && h < .036) return vec4(0.);
  float eps = 1.5*uExtent/uRes.y;
  float hx = scene(p + vec2(eps, 0.), true).h;
  float hy = scene(p + vec2(0., eps), true).h;
  vec3 N = normalize(vec3(-(hx - hc.h)/eps, -(hy - hc.h)/eps, 1.));
  if (wall > .5) {
    vec2 g = vec2(scene(p + vec2(.004,0.), false).h - scene(p - vec2(.004,0.), false).h,
                  scene(p + vec2(0.,.004), false).h - scene(p - vec2(0.,.004), false).h);
    N = normalize(vec3(-g / max(length(g), 1e-4), .12));
    hc.h = h;
  }
  vec3 V = normalize(vec3(0., -st, ct));
  vec3 L = normalize(uLight);
  vec2 pO = p + (wall > .5 ? N.xy*.012 : vec2(0.));
  float sh = softShadow(pO, hc.h + .002);
  float ao = ambientOcc(pO, hc.h);
  float spot = mix(.18, 1., smoothstep(2.1, .25, length(p - vec2(-.15, .12))));
  vec3 keyC = vec3(1.0, .93, .84) * 2.7 * spot;
  vec3 ambC = vec3(.55, .62, .78) * .26;
  vec3 albedo = vec3(.1); float rough = .6, F0 = .04, wrap = 0., spec = 1., sss = 0.;
  vec3 emit = vec3(0.);
  vec2 q = hc.info.xy;
  if (hc.id == ID_LINEN || hc.id == ID_TABLE) {
    float wv = sin(p.x*520.)*sin(p.y*520.);
    float th = .5 + .5*sin((p.x + p.y)*260. + fbm3(p*40.)*2.);
    albedo = mix(lin(vec3(.055,.06,.075)), lin(vec3(.10,.11,.14)), .35*th + .2*wv + .25*fbm3(p*3.));
    if (hc.id == ID_TABLE) albedo = lin(vec3(.05,.045,.045));
    rough = .9; spec = .2;
  } else if (hc.id == ID_SLATE) {
    float g = p.y*15. + fbm3(p*1.8)*4.2 + fbm3(p*6.)*.6;
    float rid = 1. - abs(fract(g) - .5)*2.;
    albedo = mix(lin(vec3(.075,.075,.08)), lin(vec3(.16,.16,.17)), pow(rid, 4.)*.8 + .25*fbm3(p*20.));
    rough = .42; F0 = .045; spec = 1.2;
  } else if (hc.id == ID_MEAT) {
    float s = hc.info.w; float fat;
    float dens = s > 9.5 ? .9 : .74;
    vec2 mq = q * (s > 9.5 ? 1.25 : 1.0);
    if (s > 9.5) { // sirloin: add a swirl to the grain
      float r = length(mq); float a = .9 * exp(-r*1.4);
      mq = rot(a) * mq;
    }
    albedo = meatAlbedo(mq, dens, s, fat);
    if (wall > .5) { float fw; albedo = meatAlbedo(vec2(atan(q.y,q.x)*1.4, hc.h*7.), .55, s + 3., fw) * .9; }
    float edge = smoothstep(.0, .12, hc.info.z) * (1. - wall);
    // side walls: slightly darker, silver skin hints
    albedo *= mix(.72, 1., edge);
    rough = mix(.46, .34, fat); spec = .9; wrap = .5; sss = 1.;
    if (mode == 2) {
      float marks = 0.;
      float x = p.x + .03; float k = floor(x/.15 + .5); float dx = abs(x - k*.15);
      marks = smoothstep(.044, .016, dx) * (.7 + .3*fbm3(p*vec2(40.,8.)));
      vec3 sear = searAlbedo(q, s, marks);
      float crust = uCook * mix(.75, 1., edge);
      vec3 side = mix(lin(vec3(.46,.10,.10)), lin(vec3(.40,.22,.16)), uCook*.8);
      albedo = mix(side, mix(albedo, sear, crust), edge);
      rough = mix(rough, .22 - .06*marks, uCook); spec = mix(spec, 1.5, uCook);
      sss = 1. - uCook*.8;
    }
  } else if (hc.id == ID_CUBE) {
    float s = hc.info.w; float d = hc.info.z;   // inside distance (relative)
    float fat;
    vec3 inside = meatAlbedo(q*.55 + s, .6, s, fat);
    // doneness gradient: crust -> grey band -> rosy -> ruby centre
    vec3 rosy = mix(lin(vec3(.56,.22,.21)), lin(vec3(.66,.25,.26)), smoothstep(.2,.8,d));
    vec3 cut = mix(rosy, inside*vec3(1.0,.9,.9), .25);
    cut = mix(cut, lin(vec3(.86,.68,.52)), fat*.38);
    vec3 band = lin(vec3(.42,.25,.19));
    vec3 crust = searAlbedo(q, s, 0.);
    float topk = smoothstep(.10, .16, d);
    albedo = mix(crust, band, smoothstep(.04, .09, d));
    albedo = mix(albedo, cut, smoothstep(.10, .22, d));
    if (wall > .5) albedo = searAlbedo(vec2(q.x + q.y, hc.h*8.), s, 0.);
    rough = mix(.30, .19, topk); spec = 1.25; wrap = .45; sss = topk*(1. - wall);
  } else if (hc.id == ID_SHIITAKE) {
    float k = hc.info.w;
    vec3 cap = mix(lin(vec3(.14,.075,.04)), lin(vec3(.34,.20,.11)), smoothstep(.0, .95, k));
    float fib = fbm3(vec2(atan(q.y,q.x)*18., k*6.)) ;
    cap *= .8 + .4*fib;
    cap = mix(cap, lin(vec3(.62,.46,.32)), smoothstep(.86, 1., k)*.6);
    vec3 flesh = lin(vec3(.96,.92,.84));
    albedo = mix(cap, flesh, hc.info.z);
    ao = mix(ao, 1., hc.info.z);
    rough = mix(.55, .7, hc.info.z); spec = .7; wrap = .2;
  } else if (hc.id == ID_OYSTER) {
    float rr = length(q);
    albedo = mix(lin(vec3(.93,.90,.84)), lin(vec3(.80,.75,.66)), smoothstep(.75, 1., rr)*.7 + .12*fbm3(q*25.));
    rough = .55; spec = .8; wrap = .35; sss = .3;
  } else if (hc.id == ID_ASPAR) {
    float t = hc.info.x; float side = hc.info.y;
    vec3 g = mix(lin(vec3(.55,.62,.36)), lin(vec3(.26,.44,.14)), smoothstep(.05,.35,t));
    g = mix(g, lin(vec3(.18,.30,.10)), smoothstep(.75,1.,t));
    float br = smoothstep(.55, .95, fract(t*11. + abs(side)*.4)) * step(.25, t) * (1. - abs(side));
    g = mix(g, lin(vec3(.22,.30,.10)), br*.35);
    g = mix(g, lin(vec3(.80,.78,.62)), smoothstep(.04,.0,t));
    albedo = g; rough = .35; spec = 1.; wrap = .25;
  } else if (hc.id == ID_FERN) {
    float leaf = hc.info.y;
    albedo = mix(lin(vec3(.07,.15,.045)), lin(vec3(.17,.31,.10)), leaf*.8 + .2*fbm3(p*60.));
    albedo = mix(albedo, lin(vec3(.22,.33,.12)), hc.info.z);
    rough = .45; spec = .8; wrap = .3; sss = .35;
  } else if (hc.id == ID_GRILL) {
    float rim = hc.info.z; float dx = hc.info.w;
    float rust = fbm3(p*vec2(18., 3.));
    albedo = mix(lin(vec3(.05,.045,.04)), lin(vec3(.16,.10,.07)), rust*.6);
    rough = .5; F0 = .3; spec = 1.;
    // fire light from below on the bar flanks
    float flank = smoothstep(.45, 1., abs(dx)) * (1. - rim);
    emit = lin(vec3(1., .40, .10)) * flank * .8 * (.6 + .6*fbm3(p*3.));
  }

  float NoL = dot(N, L);
  float diff = max((NoL + wrap)/(1. + wrap), 0.);
  float shS = mix(sh, 1., .25*sss);
  vec3 Lf = normalize(vec3(.35, -.75, .55));
  float difF = max((dot(N, Lf) + wrap)/(1. + wrap), 0.);
  vec3 fillC = vec3(.92, .94, 1.) * .55 * spot;
  vec3 col = albedo * (keyC * diff * shS + ambC * ao + fillC * difF * mix(ao, 1., .5));
  col += fillC * ggx(N, V, Lf, max(rough, .3), F0) * spec * .5;
  // subsurface: reddish bleed in the terminator and shadow
  col += albedo * lin(vec3(1., .30, .22)) * sss * .30 * keyC * (1. - shS*max(NoL,0.)) * smoothstep(-.4, .3, NoL) * ao;
  float spc = ggx(N, V, L, rough, F0) * spec;
  col += keyC * spc * shS;
  // wet glints on meat
  if (hc.id == ID_MEAT || hc.id == ID_CUBE) {
    vec3 Nm = normalize(N + vec3(vec2(vnoise(p*320.), vnoise(p*320. + 9.)) - .5, 0.)*.6);
    float gm = smoothstep(.55, .85, vnoise(p*90. + 3.));
    col += keyC * ggx(Nm, V, L, .14, .03) * .45 * gm * shS;
  }
  // grill modes: warm fire bounce from below on everything
  if (mode >= 2) col += albedo * lin(vec3(1., .45, .15)) * (hc.id == ID_GRILL ? .55 : .5*wall + .12) * (1. - smoothstep(.0, .18, hc.h - .03));
  col += emit;
  col *= mix(1., ao, .55);
  return vec4(col, 1.);
}

void main(){
  vec3 acc = vec3(0.); float aacc = 0.;
  int n = int(uSS + .5);
  for (int j = 0; j < 4; j++) { if (j >= n) break;
    for (int i = 0; i < 4; i++) { if (i >= n) break;
      vec2 o = (vec2(float(i), float(j)) + .5) / float(n) - .5;
      vec2 fc = gl_FragCoord.xy + o;
      vec2 p = uCenter + (fc - .5*uRes) / (.5*uRes.y) * uExtent;
      vec4 c = render(p);
      acc += c.rgb * c.a; aacc += c.a;
    }
  }
  float ns = float(n*n);
  vec3 col = aacc > 0. ? acc / aacc : vec3(0.);
  float a = aacc / ns;
  col = aces(col * 1.05);
  col = pow(col, vec3(1./2.2));
  fragColor = vec4(col * a, a);
}
`;
