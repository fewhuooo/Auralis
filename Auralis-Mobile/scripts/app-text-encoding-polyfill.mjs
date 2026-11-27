const POLYFILL_BANNER = `;(function () {
  var g = typeof globalThis !== "undefined"
    ? globalThis
    : (typeof self !== "undefined" ? self : Function("return this")());
  if (typeof g.TextEncoder === "undefined") {
    var TextEncoderPolyfill = function TextEncoder() {
      this.encoding = "utf-8";
    };
    TextEncoderPolyfill.prototype.encode = function encode(input) {
      var str = input === undefined || input === null ? "" : String(input);
      var bytes = [];
      for (var i = 0; i < str.length; i += 1) {
        var c = str.charCodeAt(i);
        if (c <= 0x7f) {
          bytes.push(c);
          continue;
        }
        if (c <= 0x7ff) {
          bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
          continue;
        }
        if (c >= 0xd800 && c <= 0xdbff) {
          var next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
          if (next >= 0xdc00 && next <= 0xdfff) {
            var cp = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
            bytes.push(
              0xf0 | (cp >> 18),
              0x80 | ((cp >> 12) & 0x3f),
              0x80 | ((cp >> 6) & 0x3f),
              0x80 | (cp & 0x3f)
            );
            i += 1;
            continue;
          }
          bytes.push(0xef, 0xbf, 0xbd);
          continue;
        }
        if (c >= 0xdc00 && c <= 0xdfff) {
          bytes.push(0xef, 0xbf, 0xbd);
          continue;
        }
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
      return new Uint8Array(bytes);
    };
    g.TextEncoder = TextEncoderPolyfill;
  }
  if (typeof g.TextDecoder === "undefined") {
    var TextDecoderPolyfill = function TextDecoder(label, options) {
      var normalized = label ? String(label).trim().toLowerCase() : "utf-8";
      var isSingleByte = normalized === "latin1"
        || normalized === "iso-8859-1"
        || normalized === "iso8859-1"
        || normalized === "iso_8859-1"
        || normalized === "ascii"
        || normalized === "us-ascii";
      if (!isSingleByte && normalized !== "utf-8" && normalized !== "utf8" && normalized !== "unicode-1-1-utf-8") {
        throw new RangeError("Unsupported encoding: " + label);
      }
      this.encoding = isSingleByte ? normalized : "utf-8";
      this._isSingleByte = isSingleByte;
      this.fatal = Boolean(options && options.fatal);
      this.ignoreBOM = Boolean(options && options.ignoreBOM);
      this._bomSeen = false;
      this._pending = [];
    };
    TextDecoderPolyfill.prototype.decode = function decode(input, decodeOptions) {
      var stream = Boolean(decodeOptions && decodeOptions.stream);
      var chunk;
      if (input === undefined || input === null) {
        chunk = new Uint8Array(0);
      } else if (input instanceof Uint8Array) {
        chunk = input;
      } else if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(input)) {
        chunk = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      } else if (
        (typeof ArrayBuffer !== "undefined" && input instanceof ArrayBuffer)
        || (typeof SharedArrayBuffer !== "undefined" && input instanceof SharedArrayBuffer)
      ) {
        chunk = new Uint8Array(input);
      } else {
        chunk = new Uint8Array(0);
      }
      if (this._isSingleByte) {
        var latin1Out = "";
        for (var s = 0; s < chunk.length; s += 1) {
          latin1Out += String.fromCharCode(chunk[s]);
        }
        return latin1Out;
      }
      var pendingLen = this._pending.length;
      var bytes = new Uint8Array(pendingLen + chunk.length);
      for (var p = 0; p < pendingLen; p += 1) {
        bytes[p] = this._pending[p];
      }
      bytes.set(chunk, pendingLen);
      this._pending = [];
      var out = "";
      var i = 0;
      var len = bytes.length;
      while (i < len) {
        var b0 = bytes[i];
        if (b0 <= 0x7f) {
          out += String.fromCharCode(b0);
          i += 1;
          continue;
        }
        if (b0 >= 0xc2 && b0 <= 0xdf) {
          if (i + 1 >= len) {
            if (stream) {
              this._pending = [b0];
              break;
            }
            out += "\\uFFFD";
            break;
          }
          var b1 = bytes[i + 1];
          if ((b1 & 0xc0) !== 0x80) {
            out += "\\uFFFD";
            i += 1;
            continue;
          }
          out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
          i += 2;
          continue;
        }
        if (b0 >= 0xe0 && b0 <= 0xef) {
          if (i + 1 >= len) {
            if (stream) {
              this._pending = [b0];
              break;
            }
            out += "\\uFFFD";
            break;
          }
          var b1e = bytes[i + 1];
          if (
            (b1e & 0xc0) !== 0x80
            || (b0 === 0xe0 && b1e < 0xa0)
            || (b0 === 0xed && b1e >= 0xa0)
          ) {
            out += "\\uFFFD";
            i += 1;
            continue;
          }
          if (i + 2 >= len) {
            if (stream) {
              this._pending = [b0, b1e];
              break;
            }
            out += "\\uFFFD";
            break;
          }
          var b2e = bytes[i + 2];
          if ((b2e & 0xc0) !== 0x80) {
            out += "\\uFFFD";
            i += 1;
            continue;
          }
          out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1e & 0x3f) << 6) | (b2e & 0x3f));
          i += 3;
          continue;
        }
        if (b0 >= 0xf0 && b0 <= 0xf4) {
          if (i + 1 >= len) {
            if (stream) {
              this._pending = [b0];
              break;
            }
            out += "\\uFFFD";
            break;
          }
          var b1f = bytes[i + 1];
          if (
            (b1f & 0xc0) !== 0x80
            || (b0 === 0xf0 && b1f < 0x90)
            || (b0 === 0xf4 && b1f > 0x8f)
          ) {
            out += "\\uFFFD";
            i += 1;
            continue;
          }
          if (i + 2 >= len) {
            if (stream) {
              this._pending = [b0, b1f];
              break;
            }
            out += "\\uFFFD";
            break;
          }
          var b2f = bytes[i + 2];
          if ((b2f & 0xc0) !== 0x80) {
            out += "\\uFFFD";
            i += 1;
            continue;
          }
          if (i + 3 >= len) {
            if (stream) {
              this._pending = [b0, b1f, b2f];
              break;
            }
            out += "\\uFFFD";
            break;
          }
          var b3f = bytes[i + 3];
          if ((b3f & 0xc0) !== 0x80) {
            out += "\\uFFFD";
            i += 1;
            continue;
          }
          var cp4 = (((b0 & 0x07) << 18) | ((b1f & 0x3f) << 12) | ((b2f & 0x3f) << 6) | (b3f & 0x3f)) - 0x10000;
          out += String.fromCharCode(0xd800 + (cp4 >> 10), 0xdc00 + (cp4 & 0x3ff));
          i += 4;
          continue;
        }
        out += "\\uFFFD";
        i += 1;
      }
      if (!this.ignoreBOM && !this._bomSeen && out.length > 0 && out.charCodeAt(0) === 0xfeff) {
        out = out.slice(1);
      }
      if (out.length > 0) {
        this._bomSeen = true;
      }
      if (!stream) {
        this._pending = [];
        this._bomSeen = false;
      }
      return out;
    };
    g.TextDecoder = TextDecoderPolyfill;
  }
})();`

/** Returns an ES5-safe UTF-8 `TextEncoder`/`TextDecoder` IIFE banner for Android 5+ J2V8 app-service bundles. */
export function createTextEncodingPolyfillBanner() {
  return POLYFILL_BANNER
}
