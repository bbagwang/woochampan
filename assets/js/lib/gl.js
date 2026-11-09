// Tiny WebGL2 helper shared by the showreel engine and the website.
export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

export function makeGL(canvas, attrs = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true, ...attrs });
  if (!gl) return null;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      throw new Error(log + '\n' + numbered.slice(0, 4000));
    }
    return s;
  }

  function program(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const locs = new Map();
    const loc = k => { if (!locs.has(k)) locs.set(k, gl.getUniformLocation(p, k)); return locs.get(k); };
    return {
      draw(u = {}, { blend = false, clear = false } = {}) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (clear) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
        if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
        gl.useProgram(p);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        for (const k in u) {
          const l = loc(k); if (l == null) continue;
          const v = u[k];
          if (v && v.type) gl['uniform' + v.type](l, v.v);
          else if (typeof v === 'number') gl.uniform1f(l, v);
          else if (v.length === 2) gl.uniform2fv(l, v);
          else if (v.length === 3) gl.uniform3fv(l, v);
          else if (v.length === 4) gl.uniform4fv(l, v);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      uniformInt(k, v) { gl.useProgram(p); const l = loc(k); if (l != null) gl.uniform1i(l, v); },
    };
  }

  function texture() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return {
      upload(src) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.generateMipmap(gl.TEXTURE_2D);
      },
    };
  }

  return { gl, program, texture };
}
