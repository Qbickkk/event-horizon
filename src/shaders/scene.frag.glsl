#version 300 es
// Ray-traces a Schwarzschild black hole. Units: r_s = 1.
// Light paths follow x'' = -1.5 h^2 x / r^5, which reproduces Schwarzschild null geodesics exactly.
precision highp float;

out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform mat3 uCamRot;   // columns: right, up, forward
uniform float uTan;     // tan of half the vertical field of view
uniform float uDisk;    // 1 draws the accretion disk
uniform float uRel;     // 0..1 mix of Doppler beaming and gravitational redshift
uniform float uTemp;    // peak disk temperature, K
uniform float uRin;     // inner disk radius
uniform float uRout;    // outer disk radius
uniform float uHdr;     // storage scale for the render target
uniform int uSteps;     // integration step budget

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec3(3.1, 1.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// Linear-light colour of a blackbody at temperature T (Tanner Helland's fit).
vec3 blackbody(float T) {
  float t = clamp(T, 1000.0, 40000.0) / 100.0;
  vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.29293618 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.39008158 * log(t) - 0.63184144, 0.0, 1.0)
                  : clamp(1.12989086 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.54320679 * log(t - 10.0) - 1.19625409, 0.0, 1.0));
  return pow(c, vec3(2.2));
}

// One layer of stars on a cube-map grid, at most one star per cell.
vec3 starLayer(vec3 d, float scale, float density, float seed, float pix) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z)          { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else                          { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec2 g = uv * scale;
  vec2 cell = floor(g);
  vec3 h = hash33(vec3(cell, face * 17.0 + seed));
  if (h.z > density) return vec3(0.0);
  float dist = length(fract(g) - (0.25 + 0.5 * h.xy));
  float size = max(pix * scale * 0.9, 0.035);
  float b = exp(-dist * dist / (size * size));
  vec3 h2 = hash33(vec3(cell, face * 17.0 + seed + 91.0));
  float temp = mix(2800.0, 15000.0, h2.x * h2.x);
  float mag = 0.07 + 3.5 * pow(h2.y, 9.0);
  return blackbody(temp) * b * mag;
}

vec3 sky(vec3 d, float pix) {
  vec3 col = starLayer(d, 70.0, 0.22, 1.0, pix);
  col += starLayer(d, 150.0, 0.14, 2.0, pix);
  col += starLayer(d, 240.0, 0.06, 3.0, pix) * 0.6;

  // a faint galactic band, placed behind the hole from the default view
  vec3 pole = normalize(vec3(0.43, 0.64, -0.64));
  vec3 core = normalize(vec3(-0.917, 0.261, -0.303));
  float lat = dot(d, pole);
  float band = exp(-lat * lat * 14.0);
  float neb = fbm(d * 3.5 + 7.0);
  float dust = fbm(d * 8.0 + 2.0);
  float bulge = exp(-pow(distance(d, core), 2.0) * 3.0);
  vec3 tint = mix(vec3(0.20, 0.26, 0.45), vec3(0.85, 0.62, 0.42), bulge);
  float glow = band * (0.35 + neb) * (1.0 - 0.75 * smoothstep(0.45, 0.7, dust) * band);
  return col + tint * glow * (0.05 + 0.12 * bulge);
}

// Emission (rgb) and opacity (a) where a ray crosses the disk plane at p, radius r, travelling along rd.
vec4 disk(vec3 p, float r, vec3 rd) {
  // Novikov-Thorne flux profile, normalised to 1 at its peak (r = 1.36 r_in)
  float x = r / uRin;
  float prof = max(pow(x, -3.0) * (1.0 - inversesqrt(x)), 0.0) / 0.05665;

  // turbulence carried by Keplerian shear; two phase-offset layers hide the reset
  float phi = atan(p.z, p.x);
  float om = 2.6 * pow(r, -1.5);
  float cyc = 7.0;
  float tt = uTime / cyc;
  float f1 = fract(tt), f2 = fract(tt + 0.5);
  float a1 = phi - om * f1 * cyc;
  float a2 = phi - om * f2 * cyc;
  float lr = log(r) * 6.0;
  float n1 = fbm(vec3(cos(a1) * 2.4, sin(a1) * 2.4, lr) + floor(tt) * 1.37);
  float n2 = fbm(vec3(cos(a2) * 2.4, sin(a2) * 2.4, lr) + floor(tt + 0.5) * 1.37 + 11.0);
  float n = mix(n1, n2, abs(2.0 * f1 - 1.0));
  float tex = smoothstep(0.22, 0.78, n);
  tex *= 0.78 + 0.22 * sin(lr * 3.0 + n * 6.0);

  float edge = smoothstep(uRin * 0.99, uRin * 1.12, r) * (1.0 - smoothstep(uRout * 0.6, uRout, r));
  float alpha = clamp((0.3 + 0.9 * tex) * edge * smoothstep(0.0, 0.12, prof), 0.0, 0.96);

  // orbital Doppler factor times gravitational redshift
  float beta = min(sqrt(0.5 / max(r - 1.0, 0.05)), 0.95);
  vec3 vdir = vec3(-p.z, 0.0, p.x) / r;
  vec3 toEye = -normalize(rd);
  float gam = inversesqrt(1.0 - beta * beta);
  float D = 1.0 / (gam * (1.0 - beta * dot(vdir, toEye)));
  float g = mix(1.0, D * sqrt(max(1.0 - 1.0 / r, 0.0)), uRel);

  float T = uTemp * pow(prof, 0.25) * g;
  float I = prof * pow(g, 4.0) * (0.4 + 1.4 * tex) * 1.8;
  return vec4(blackbody(T) * I, alpha);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 dir = normalize(uCamRot * vec3(uv * 2.0 * uTan, 1.0));
  vec3 pos = uCamPos;
  vec3 hv = cross(pos, dir);
  float h2 = dot(hv, hv);
  float pix = 2.0 * uTan / uRes.y;

  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool escaped = false;

  for (int i = 0; i < 480; i++) {
    if (i >= uSteps) break;
    float r2 = dot(pos, pos);
    if (r2 < 1.0) break;                                       // fell through the horizon
    float r = sqrt(r2);
    if (r > 50.0 && dot(pos, dir) > 0.0) { escaped = true; break; }

    float dt = r * mix(0.04, 0.16, smoothstep(5.0, 30.0, r));
    vec3 prev = pos;
    dir += -1.5 * h2 * pos / (r2 * r2 * r) * dt;
    pos += dir * dt;

    if (uDisk > 0.5 && prev.y * pos.y < 0.0) {
      vec3 hit = mix(prev, pos, prev.y / (prev.y - pos.y));
      float hr = length(hit.xz);
      if (hr > uRin && hr < uRout) {
        vec4 e = disk(hit, hr, dir);
        col += trans * e.rgb * e.a;
        trans *= 1.0 - e.a;
        if (trans < 0.02) break;
      }
    }
  }

  if (escaped) col += trans * sky(normalize(dir), pix);
  fragColor = vec4(col * uHdr, 1.0);
}
