var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/professionalForm.js
var professionalForm_exports = {};
__export(professionalForm_exports, {
  readForm: () => readForm,
  renderForm: () => renderForm
});
var fields = [
  ["eyebrow", "Short label", "text", "Independent consultant"],
  ["heading", "Homepage heading", "text", "Your main introduction"],
  ["intro", "Introduction", "textarea", "What you do, who you help, and how you work."],
  ["location", "Location", "text", "City, area or practice address"],
  ["hours", "Hours / availability note", "textarea", "By appointment"],
  ["email", "Public email", "email", "hello@example.com"],
  ["phone", "Public phone", "tel", ""],
  ["bookingUrl", "Booking page", "url", "https://\u2026"],
  ["bookingLabel", "Booking button text", "text", "Book an appointment"],
  ["credentials", "Qualifications or useful details \u2014 one per line", "textarea", ""]
];
function field(key, label, type, value, placeholder) {
  const wrap = document.createElement("div"), lab = document.createElement("label"), input = document.createElement(type === "textarea" ? "textarea" : "input");
  input.id = "pro-" + key;
  input.dataset.field = key;
  lab.htmlFor = input.id;
  lab.textContent = label;
  if (type !== "textarea") input.type = type;
  else input.rows = key === "intro" ? 3 : 2;
  input.value = value || "";
  input.placeholder = placeholder || "";
  input.style.width = "100%";
  input.style.marginBottom = ".7rem";
  wrap.append(lab, input);
  return wrap;
}
var serviceSequence = 0;
function serviceRow(host, service = {}) {
  const rowId = ++serviceSequence;
  const row = document.createElement("div");
  row.className = "pro-service-editor";
  row.style.cssText = "border-top:1px solid var(--line);padding:1rem 0";
  for (const [key, label] of [["name", "Service name"], ["description", "Description"], ["price", "Price or price note (optional)"], ["duration", "Duration (optional)"], ["bookingUrl", "Service booking link (optional)"]]) {
    const wrap = field("service-" + rowId + "-" + key, label, key === "description" ? "textarea" : key === "bookingUrl" ? "url" : "text", service[key], "");
    wrap.querySelector("input,textarea").dataset.service = key;
    row.append(wrap);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn ghost";
  remove.textContent = "Remove service";
  remove.onclick = () => row.remove();
  row.append(remove);
  host.append(row);
}
function renderForm(root, value = {}) {
  if (!root) return;
  const p = value && typeof value === "object" ? value : {};
  root.replaceChildren();
  root.dataset.loaded = "true";
  for (const [key, label, type, placeholder] of fields) root.append(field(key, label, type, key === "credentials" ? (p.credentials || []).join("\n") : p[key], placeholder));
  const hint = document.createElement("p");
  hint.className = "sub";
  hint.textContent = "Paste your Cal.com event link to offer an on-site calendar, or link to another booking service. Your provider saves appointments and handles confirmation emails. Connect your calendar and, for paid appointments, Stripe in your provider account. Prices below are display text; set the actual charge in the booking service.";
  root.append(hint);
  const title = document.createElement("h3");
  title.textContent = "Services";
  root.append(title);
  const rows = document.createElement("div");
  rows.dataset.services = "";
  root.append(rows);
  for (const service of Array.isArray(p.services) ? p.services : []) serviceRow(rows, service);
  const add = document.createElement("button");
  add.type = "button";
  add.className = "btn ghost";
  add.textContent = "Add a service";
  add.onclick = () => {
    if (rows.children.length < 8) serviceRow(rows);
  };
  root.append(add);
}
function readForm(root, current = {}) {
  if (!root || root.dataset.loaded !== "true") return current;
  const result = { ...current };
  for (const [key] of fields) {
    const input = root.querySelector('[data-field="' + key + '"]');
    if (!input.checkValidity()) {
      input.reportValidity();
      throw Error("Please check " + key.replace(/([A-Z])/g, " $1").toLowerCase() + ".");
    }
    result[key] = input.value.trim();
  }
  if (result.bookingUrl) {
    let u;
    try {
      u = new URL(result.bookingUrl);
    } catch {
    }
    if (!u || u.protocol !== "https:" || u.username || u.password) throw Error("Use a complete HTTPS booking link without a username or password.");
  }
  for (const input of root.querySelectorAll("[data-service=bookingUrl]")) {
    if (input.value.trim()) {
      let u;
      try {
        u = new URL(input.value.trim());
      } catch {
      }
      if (!u || u.protocol !== "https:" || u.username || u.password) throw Error("Use a complete HTTPS link for each service booking.");
    }
  }
  result.credentials = result.credentials.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);
  result.services = [...root.querySelectorAll(".pro-service-editor")].map((row) => Object.fromEntries([...row.querySelectorAll("[data-service]")].map((input) => [input.dataset.service, input.value.trim()]))).filter((s) => s.name).slice(0, 8);
  return result;
}

// engine/figures/svg.js
var PALETTE = {
  ink: "var(--ink)",
  inkDim: "var(--ink-dim)",
  teal: "var(--teal)",
  cyan: "var(--cyan)",
  violet: "var(--violet)"
};
var INK = PALETTE.ink;
var INK_DIM = PALETTE.inkDim;
var SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i;

// node_modules/dompurify/dist/purify.es.mjs
function _arrayLikeToArray(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}
function _arrayWithHoles(r) {
  if (Array.isArray(r)) return r;
}
function _iterableToArrayLimit(r, l) {
  var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (null != t) {
    var e, n, i, u, a = [], f = true, o = false;
    try {
      if (i = (t = t.call(r)).next, 0 === l) ;
      else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = true) ;
    } catch (r2) {
      o = true, n = r2;
    } finally {
      try {
        if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
      } finally {
        if (o) throw n;
      }
    }
    return a;
  }
}
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _slicedToArray(r, e) {
  return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
}
function _unsupportedIterableToArray(r, a) {
  if (r) {
    if ("string" == typeof r) return _arrayLikeToArray(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
  }
}
var entries = Object.entries;
var setPrototypeOf = Object.setPrototypeOf;
var isFrozen = Object.isFrozen;
var getPrototypeOf = Object.getPrototypeOf;
var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
var freeze = Object.freeze;
var seal = Object.seal;
var create = Object.create;
var _ref = typeof Reflect !== "undefined" && Reflect;
var apply = _ref.apply;
var construct = _ref.construct;
if (!freeze) {
  freeze = function freeze2(x) {
    return x;
  };
}
if (!seal) {
  seal = function seal2(x) {
    return x;
  };
}
if (!apply) {
  apply = function apply2(func, thisArg) {
    for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      args[_key - 2] = arguments[_key];
    }
    return func.apply(thisArg, args);
  };
}
if (!construct) {
  construct = function construct2(Func) {
    for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }
    return new Func(...args);
  };
}
var arrayForEach = unapply(Array.prototype.forEach);
var arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
var arrayPop = unapply(Array.prototype.pop);
var arrayPush = unapply(Array.prototype.push);
var arraySplice = unapply(Array.prototype.splice);
var arrayIsArray = Array.isArray;
var stringToLowerCase = unapply(String.prototype.toLowerCase);
var stringToString = unapply(String.prototype.toString);
var stringMatch = unapply(String.prototype.match);
var stringReplace = unapply(String.prototype.replace);
var stringIndexOf = unapply(String.prototype.indexOf);
var stringTrim = unapply(String.prototype.trim);
var numberToString = unapply(Number.prototype.toString);
var booleanToString = unapply(Boolean.prototype.toString);
var bigintToString = typeof BigInt === "undefined" ? null : unapply(BigInt.prototype.toString);
var symbolToString = typeof Symbol === "undefined" ? null : unapply(Symbol.prototype.toString);
var objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
var objectToString = unapply(Object.prototype.toString);
var regExpTest = unapply(RegExp.prototype.test);
var typeErrorCreate = unconstruct(TypeError);
function unapply(func) {
  return function(thisArg) {
    if (thisArg instanceof RegExp) {
      thisArg.lastIndex = 0;
    }
    for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
      args[_key3 - 1] = arguments[_key3];
    }
    return apply(func, thisArg, args);
  };
}
function unconstruct(Func) {
  return function() {
    for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }
    return construct(Func, args);
  };
}
function addToSet(set, array) {
  let transformCaseFunc = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : stringToLowerCase;
  if (setPrototypeOf) {
    setPrototypeOf(set, null);
  }
  if (!arrayIsArray(array)) {
    return set;
  }
  let l = array.length;
  while (l--) {
    let element = array[l];
    if (typeof element === "string") {
      const lcElement = transformCaseFunc(element);
      if (lcElement !== element) {
        if (!isFrozen(array)) {
          array[l] = lcElement;
        }
        element = lcElement;
      }
    }
    set[element] = true;
  }
  return set;
}
function cleanArray(array) {
  for (let index = 0; index < array.length; index++) {
    const isPropertyExist = objectHasOwnProperty(array, index);
    if (!isPropertyExist) {
      array[index] = null;
    }
  }
  return array;
}
function clone(object) {
  const newObject = create(null);
  for (const _ref2 of entries(object)) {
    var _ref3 = _slicedToArray(_ref2, 2);
    const property = _ref3[0];
    const value = _ref3[1];
    const isPropertyExist = objectHasOwnProperty(object, property);
    if (isPropertyExist) {
      if (arrayIsArray(value)) {
        newObject[property] = cleanArray(value);
      } else if (value && typeof value === "object" && value.constructor === Object) {
        newObject[property] = clone(value);
      } else {
        newObject[property] = value;
      }
    }
  }
  return newObject;
}
function stringifyValue(value) {
  switch (typeof value) {
    case "string": {
      return value;
    }
    case "number": {
      return numberToString(value);
    }
    case "boolean": {
      return booleanToString(value);
    }
    case "bigint": {
      return bigintToString ? bigintToString(value) : "0";
    }
    case "symbol": {
      return symbolToString ? symbolToString(value) : "Symbol()";
    }
    case "undefined": {
      return objectToString(value);
    }
    case "function":
    case "object": {
      if (value === null) {
        return objectToString(value);
      }
      const valueAsRecord = value;
      const valueToString = lookupGetter(valueAsRecord, "toString");
      if (typeof valueToString === "function") {
        const stringified = valueToString(valueAsRecord);
        return typeof stringified === "string" ? stringified : objectToString(stringified);
      }
      return objectToString(value);
    }
    default: {
      return objectToString(value);
    }
  }
}
function lookupGetter(object, prop) {
  while (object !== null) {
    const desc = getOwnPropertyDescriptor(object, prop);
    if (desc) {
      if (desc.get) {
        return unapply(desc.get);
      }
      if (typeof desc.value === "function") {
        return unapply(desc.value);
      }
    }
    object = getPrototypeOf(object);
  }
  function fallbackValue() {
    return null;
  }
  return fallbackValue;
}
function isRegex(value) {
  try {
    regExpTest(value, "");
    return true;
  } catch (_unused) {
    return false;
  }
}
var html$1 = freeze(["a", "abbr", "acronym", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "big", "blink", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "content", "data", "datalist", "dd", "decorator", "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "element", "em", "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "marquee", "menu", "menuitem", "meter", "nav", "nobr", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "search", "section", "select", "shadow", "slot", "small", "source", "spacer", "span", "strike", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "tr", "track", "tt", "u", "ul", "var", "video", "wbr"]);
var svg$1 = freeze(["svg", "a", "altglyph", "altglyphdef", "altglyphitem", "animatecolor", "animatemotion", "animatetransform", "circle", "clippath", "defs", "desc", "ellipse", "enterkeyhint", "exportparts", "filter", "font", "g", "glyph", "glyphref", "hkern", "image", "inputmode", "line", "lineargradient", "marker", "mask", "metadata", "mpath", "part", "path", "pattern", "polygon", "polyline", "radialgradient", "rect", "stop", "style", "switch", "symbol", "text", "textpath", "title", "tref", "tspan", "view", "vkern"]);
var svgFilters = freeze(["feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence"]);
var svgDisallowed = freeze(["animate", "color-profile", "cursor", "discard", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignobject", "hatch", "hatchpath", "mesh", "meshgradient", "meshpatch", "meshrow", "missing-glyph", "script", "set", "solidcolor", "unknown", "use"]);
var mathMl$1 = freeze(["math", "menclose", "merror", "mfenced", "mfrac", "mglyph", "mi", "mlabeledtr", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mroot", "mrow", "ms", "mspace", "msqrt", "mstyle", "msub", "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", "mprescripts"]);
var mathMlDisallowed = freeze(["maction", "maligngroup", "malignmark", "mlongdiv", "mscarries", "mscarry", "msgroup", "mstack", "msline", "msrow", "semantics", "annotation", "annotation-xml", "mprescripts", "none"]);
var text = freeze(["#text"]);
var html = freeze(["accept", "action", "align", "alt", "autocapitalize", "autocomplete", "autopictureinpicture", "autoplay", "background", "bgcolor", "border", "capture", "cellpadding", "cellspacing", "checked", "cite", "class", "clear", "color", "cols", "colspan", "command", "commandfor", "controls", "controlslist", "coords", "crossorigin", "datetime", "decoding", "default", "dir", "disabled", "disablepictureinpicture", "disableremoteplayback", "download", "draggable", "enctype", "enterkeyhint", "exportparts", "face", "for", "headers", "height", "hidden", "high", "href", "hreflang", "id", "inert", "inputmode", "integrity", "ismap", "kind", "label", "lang", "list", "loading", "loop", "low", "max", "maxlength", "media", "method", "min", "minlength", "multiple", "muted", "name", "nonce", "noshade", "novalidate", "nowrap", "open", "optimum", "part", "pattern", "placeholder", "playsinline", "popover", "popovertarget", "popovertargetaction", "poster", "preload", "pubdate", "radiogroup", "readonly", "rel", "required", "rev", "reversed", "role", "rows", "rowspan", "spellcheck", "scope", "selected", "shape", "size", "sizes", "slot", "span", "srclang", "start", "src", "srcset", "step", "style", "summary", "tabindex", "title", "translate", "type", "usemap", "valign", "value", "width", "wrap", "xmlns"]);
var svg = freeze(["accent-height", "accumulate", "additive", "alignment-baseline", "amplitude", "ascent", "attributename", "attributetype", "azimuth", "basefrequency", "baseline-shift", "begin", "bias", "by", "class", "clip", "clippathunits", "clip-path", "clip-rule", "color", "color-interpolation", "color-interpolation-filters", "color-profile", "color-rendering", "cx", "cy", "d", "dx", "dy", "diffuseconstant", "direction", "display", "divisor", "dominant-baseline", "dur", "edgemode", "elevation", "end", "exponent", "fill", "fill-opacity", "fill-rule", "filter", "filterunits", "flood-color", "flood-opacity", "font-family", "font-size", "font-size-adjust", "font-stretch", "font-style", "font-variant", "font-weight", "fx", "fy", "g1", "g2", "glyph-name", "glyphref", "gradientunits", "gradienttransform", "height", "href", "id", "image-rendering", "in", "in2", "intercept", "k", "k1", "k2", "k3", "k4", "kerning", "keypoints", "keysplines", "keytimes", "lang", "lengthadjust", "letter-spacing", "kernelmatrix", "kernelunitlength", "lighting-color", "local", "marker-end", "marker-mid", "marker-start", "markerheight", "markerunits", "markerwidth", "maskcontentunits", "maskunits", "max", "mask", "mask-type", "media", "method", "mode", "min", "name", "numoctaves", "offset", "operator", "opacity", "order", "orient", "orientation", "origin", "overflow", "paint-order", "path", "pathlength", "patterncontentunits", "patterntransform", "patternunits", "points", "preservealpha", "preserveaspectratio", "primitiveunits", "r", "rx", "ry", "radius", "refx", "refy", "repeatcount", "repeatdur", "restart", "result", "rotate", "scale", "seed", "shape-rendering", "slope", "specularconstant", "specularexponent", "spreadmethod", "startoffset", "stddeviation", "stitchtiles", "stop-color", "stop-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke", "stroke-width", "style", "surfacescale", "systemlanguage", "tabindex", "tablevalues", "targetx", "targety", "transform", "transform-origin", "text-anchor", "text-decoration", "text-orientation", "text-rendering", "textlength", "type", "u1", "u2", "unicode", "values", "viewbox", "visibility", "version", "vert-adv-y", "vert-origin-x", "vert-origin-y", "width", "word-spacing", "wrap", "writing-mode", "xchannelselector", "ychannelselector", "x", "x1", "x2", "xmlns", "y", "y1", "y2", "z", "zoomandpan"]);
var mathMl = freeze(["accent", "accentunder", "align", "bevelled", "close", "columnalign", "columnlines", "columnspacing", "columnspan", "denomalign", "depth", "dir", "display", "displaystyle", "encoding", "fence", "frame", "height", "href", "id", "largeop", "length", "linethickness", "lquote", "lspace", "mathbackground", "mathcolor", "mathsize", "mathvariant", "maxsize", "minsize", "movablelimits", "notation", "numalign", "open", "rowalign", "rowlines", "rowspacing", "rowspan", "rspace", "rquote", "scriptlevel", "scriptminsize", "scriptsizemultiplier", "selection", "separator", "separators", "stretchy", "subscriptshift", "supscriptshift", "symmetric", "voffset", "width", "xmlns"]);
var xml = freeze(["xlink:href", "xml:id", "xlink:title", "xml:space", "xmlns:xlink"]);
var MUSTACHE_EXPR = seal(/{{[\w\W]*|^[\w\W]*}}/g);
var ERB_EXPR = seal(/<%[\w\W]*|^[\w\W]*%>/g);
var TMPLIT_EXPR = seal(/\${[\w\W]*/g);
var DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/);
var ARIA_ATTR = seal(/^aria-[\-\w]+$/);
var IS_ALLOWED_URI = seal(
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  // eslint-disable-line no-useless-escape
);
var IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
var ATTR_WHITESPACE = seal(
  /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g
  // eslint-disable-line no-control-regex
);
var DOCTYPE_NAME = seal(/^html$/i);
var CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);
var ELEMENT_MARKUP_PROBE = seal(/<[/\w!]/g);
var COMMENT_MARKUP_PROBE = seal(/<[/\w]/g);
var FALLBACK_TAG_CLOSE = seal(/<\/no(script|embed|frames)/i);
var SELF_CLOSING_TAG = seal(/\/>/i);
var NODE_TYPE = {
  element: 1,
  attribute: 2,
  text: 3,
  cdataSection: 4,
  entityReference: 5,
  // Deprecated
  entityNode: 6,
  // Deprecated
  processingInstruction: 7,
  comment: 8,
  document: 9,
  documentType: 10,
  documentFragment: 11,
  notation: 12
  // Deprecated
};
var getGlobal = function getGlobal2() {
  return typeof window === "undefined" ? null : window;
};
var _createTrustedTypesPolicy = function _createTrustedTypesPolicy2(trustedTypes, purifyHostElement) {
  if (typeof trustedTypes !== "object" || typeof trustedTypes.createPolicy !== "function") {
    return null;
  }
  let suffix = null;
  const ATTR_NAME = "data-tt-policy-suffix";
  if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) {
    suffix = purifyHostElement.getAttribute(ATTR_NAME);
  }
  const policyName = "dompurify" + (suffix ? "#" + suffix : "");
  try {
    return trustedTypes.createPolicy(policyName, {
      createHTML(html2) {
        return html2;
      },
      createScriptURL(scriptUrl) {
        return scriptUrl;
      }
    });
  } catch (_) {
    console.warn("TrustedTypes policy " + policyName + " could not be created.");
    return null;
  }
};
var _createHooksMap = function _createHooksMap2() {
  return {
    afterSanitizeAttributes: [],
    afterSanitizeElements: [],
    afterSanitizeShadowDOM: [],
    beforeSanitizeAttributes: [],
    beforeSanitizeElements: [],
    beforeSanitizeShadowDOM: [],
    uponSanitizeAttribute: [],
    uponSanitizeElement: [],
    uponSanitizeShadowNode: []
  };
};
var _resolveSetOption = function _resolveSetOption2(cfg, key, fallback, options) {
  return objectHasOwnProperty(cfg, key) && arrayIsArray(cfg[key]) ? addToSet(options.base ? clone(options.base) : {}, cfg[key], options.transform) : fallback;
};
function createDOMPurify() {
  let window2 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : getGlobal();
  const DOMPurify = (root) => createDOMPurify(root);
  DOMPurify.version = "3.4.13";
  DOMPurify.removed = [];
  if (!window2 || !window2.document || window2.document.nodeType !== NODE_TYPE.document || !window2.Element) {
    DOMPurify.isSupported = false;
    return DOMPurify;
  }
  let document2 = window2.document;
  const originalDocument = document2;
  const currentScript = originalDocument.currentScript;
  window2.DocumentFragment;
  const HTMLTemplateElement = window2.HTMLTemplateElement, Node = window2.Node, Element = window2.Element, NodeFilter = window2.NodeFilter, _window$NamedNodeMap = window2.NamedNodeMap;
  _window$NamedNodeMap === void 0 ? window2.NamedNodeMap || window2.MozNamedAttrMap : _window$NamedNodeMap;
  window2.HTMLFormElement;
  const DOMParser = window2.DOMParser, trustedTypes = window2.trustedTypes;
  const ElementPrototype = Element.prototype;
  const cloneNode = lookupGetter(ElementPrototype, "cloneNode");
  const remove = lookupGetter(ElementPrototype, "remove");
  const getNextSibling = lookupGetter(ElementPrototype, "nextSibling");
  const getChildNodes = lookupGetter(ElementPrototype, "childNodes");
  const getParentNode = lookupGetter(ElementPrototype, "parentNode");
  const getShadowRoot = lookupGetter(ElementPrototype, "shadowRoot");
  const getAttributes = lookupGetter(ElementPrototype, "attributes");
  const getNodeType = Node && Node.prototype ? lookupGetter(Node.prototype, "nodeType") : null;
  const getNodeName = Node && Node.prototype ? lookupGetter(Node.prototype, "nodeName") : null;
  const getOwnerDocument = Node && Node.prototype ? lookupGetter(Node.prototype, "ownerDocument") : null;
  if (typeof HTMLTemplateElement === "function") {
    const template = document2.createElement("template");
    if (template.content && template.content.ownerDocument) {
      document2 = template.content.ownerDocument;
    }
  }
  let trustedTypesPolicy;
  let emptyHTML = "";
  let defaultTrustedTypesPolicy;
  let defaultTrustedTypesPolicyResolved = false;
  let IN_TRUSTED_TYPES_POLICY = 0;
  const _assertNotInTrustedTypesPolicy = function _assertNotInTrustedTypesPolicy2() {
    if (IN_TRUSTED_TYPES_POLICY > 0) {
      throw typeErrorCreate('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.');
    }
  };
  const _createTrustedHTML = function _createTrustedHTML2(html2) {
    _assertNotInTrustedTypesPolicy();
    IN_TRUSTED_TYPES_POLICY++;
    try {
      return trustedTypesPolicy.createHTML(html2);
    } finally {
      IN_TRUSTED_TYPES_POLICY--;
    }
  };
  const _createTrustedScriptURL = function _createTrustedScriptURL2(scriptUrl) {
    _assertNotInTrustedTypesPolicy();
    IN_TRUSTED_TYPES_POLICY++;
    try {
      return trustedTypesPolicy.createScriptURL(scriptUrl);
    } finally {
      IN_TRUSTED_TYPES_POLICY--;
    }
  };
  const _getDefaultTrustedTypesPolicy = function _getDefaultTrustedTypesPolicy2() {
    if (!defaultTrustedTypesPolicyResolved) {
      defaultTrustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
      defaultTrustedTypesPolicyResolved = true;
    }
    return defaultTrustedTypesPolicy;
  };
  const _document = document2, implementation = _document.implementation, createNodeIterator = _document.createNodeIterator, createDocumentFragment = _document.createDocumentFragment, getElementsByTagName = _document.getElementsByTagName;
  const importNode = originalDocument.importNode;
  let hooks = _createHooksMap();
  DOMPurify.isSupported = typeof entries === "function" && typeof getParentNode === "function" && implementation && implementation.createHTMLDocument !== void 0;
  const MUSTACHE_EXPR$1 = MUSTACHE_EXPR, ERB_EXPR$1 = ERB_EXPR, TMPLIT_EXPR$1 = TMPLIT_EXPR, DATA_ATTR$1 = DATA_ATTR, ARIA_ATTR$1 = ARIA_ATTR, IS_SCRIPT_OR_DATA$1 = IS_SCRIPT_OR_DATA, ATTR_WHITESPACE$1 = ATTR_WHITESPACE, CUSTOM_ELEMENT$1 = CUSTOM_ELEMENT;
  let IS_ALLOWED_URI$1 = IS_ALLOWED_URI;
  let ALLOWED_TAGS = null;
  const DEFAULT_ALLOWED_TAGS = addToSet({}, [...html$1, ...svg$1, ...svgFilters, ...mathMl$1, ...text]);
  let ALLOWED_ATTR = null;
  const DEFAULT_ALLOWED_ATTR = addToSet({}, [...html, ...svg, ...mathMl, ...xml]);
  let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
    tagNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    allowCustomizedBuiltInElements: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: false
    }
  }));
  let FORBID_TAGS = null;
  let FORBID_ATTR = null;
  const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
    tagCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    }
  }));
  let ALLOW_ARIA_ATTR = true;
  let ALLOW_DATA_ATTR = true;
  let ALLOW_UNKNOWN_PROTOCOLS = false;
  let ALLOW_SELF_CLOSE_IN_ATTR = true;
  let SAFE_FOR_TEMPLATES = false;
  let SAFE_FOR_XML = true;
  let WHOLE_DOCUMENT = false;
  let SET_CONFIG = false;
  let SET_CONFIG_ALLOWED_TAGS = null;
  let SET_CONFIG_ALLOWED_ATTR = null;
  let FORCE_BODY = false;
  let RETURN_DOM = false;
  let RETURN_DOM_FRAGMENT = false;
  let RETURN_TRUSTED_TYPE = false;
  let SANITIZE_DOM = true;
  let SANITIZE_NAMED_PROPS = false;
  const SANITIZE_NAMED_PROPS_PREFIX = "user-content-";
  let KEEP_CONTENT = true;
  let IN_PLACE = false;
  let USE_PROFILES = {};
  let FORBID_CONTENTS = null;
  const DEFAULT_FORBID_CONTENTS = addToSet({}, [
    "annotation-xml",
    "audio",
    "colgroup",
    "desc",
    "foreignobject",
    "head",
    "iframe",
    "math",
    "mi",
    "mn",
    "mo",
    "ms",
    "mtext",
    "noembed",
    "noframes",
    "noscript",
    "plaintext",
    "script",
    // <selectedcontent> mirrors the selected <option>'s subtree, cloned by
    // the UA (customizable <select>) — including any on* handlers — and the
    // engine re-mirrors synchronously whenever a removal changes which
    // option/selectedcontent is current, even inside DOMPurify's inert
    // DOMParser document. Hoisting its children on removal re-inserts a fresh
    // mirror target ahead of the walk, which the engine refills, looping
    // forever (DoS) and amplifying output. Dropping its content on removal
    // (rather than hoisting) breaks that cascade; the content is a duplicate
    // of the option, which is sanitized on its own. See campaign-3 F1/F6.
    "selectedcontent",
    "style",
    "svg",
    "template",
    "thead",
    "title",
    "video",
    "xmp"
  ]);
  let DATA_URI_TAGS = null;
  const DEFAULT_DATA_URI_TAGS = addToSet({}, ["audio", "video", "img", "source", "image", "track"]);
  let URI_SAFE_ATTRIBUTES = null;
  const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, ["alt", "class", "for", "id", "label", "name", "pattern", "placeholder", "role", "summary", "title", "value", "style", "xmlns"]);
  const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
  let NAMESPACE = HTML_NAMESPACE;
  let IS_EMPTY_INPUT = false;
  let ALLOWED_NAMESPACES = null;
  const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [MATHML_NAMESPACE, SVG_NAMESPACE, HTML_NAMESPACE], stringToString);
  const DEFAULT_MATHML_TEXT_INTEGRATION_POINTS = freeze(["mi", "mo", "mn", "ms", "mtext"]);
  let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
  const DEFAULT_HTML_INTEGRATION_POINTS = freeze(["annotation-xml"]);
  let HTML_INTEGRATION_POINTS = addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
  const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, ["title", "style", "font", "a", "script"]);
  let PARSER_MEDIA_TYPE = null;
  const SUPPORTED_PARSER_MEDIA_TYPES = ["application/xhtml+xml", "text/html"];
  const DEFAULT_PARSER_MEDIA_TYPE = "text/html";
  let transformCaseFunc = null;
  let CONFIG = null;
  const formElement = document2.createElement("form");
  const isRegexOrFunction = function isRegexOrFunction2(testValue) {
    return testValue instanceof RegExp || testValue instanceof Function;
  };
  const _parseConfig = function _parseConfig2() {
    let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    if (CONFIG && CONFIG === cfg) {
      return;
    }
    if (!cfg || typeof cfg !== "object") {
      cfg = {};
    }
    cfg = clone(cfg);
    PARSER_MEDIA_TYPE = // eslint-disable-next-line unicorn/prefer-includes
    SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
    transformCaseFunc = PARSER_MEDIA_TYPE === "application/xhtml+xml" ? stringToString : stringToLowerCase;
    ALLOWED_TAGS = _resolveSetOption(cfg, "ALLOWED_TAGS", DEFAULT_ALLOWED_TAGS, {
      transform: transformCaseFunc
    });
    ALLOWED_ATTR = _resolveSetOption(cfg, "ALLOWED_ATTR", DEFAULT_ALLOWED_ATTR, {
      transform: transformCaseFunc
    });
    ALLOWED_NAMESPACES = _resolveSetOption(cfg, "ALLOWED_NAMESPACES", DEFAULT_ALLOWED_NAMESPACES, {
      transform: stringToString
    });
    URI_SAFE_ATTRIBUTES = _resolveSetOption(cfg, "ADD_URI_SAFE_ATTR", DEFAULT_URI_SAFE_ATTRIBUTES, {
      transform: transformCaseFunc,
      base: DEFAULT_URI_SAFE_ATTRIBUTES
    });
    DATA_URI_TAGS = _resolveSetOption(cfg, "ADD_DATA_URI_TAGS", DEFAULT_DATA_URI_TAGS, {
      transform: transformCaseFunc,
      base: DEFAULT_DATA_URI_TAGS
    });
    FORBID_CONTENTS = _resolveSetOption(cfg, "FORBID_CONTENTS", DEFAULT_FORBID_CONTENTS, {
      transform: transformCaseFunc
    });
    FORBID_TAGS = _resolveSetOption(cfg, "FORBID_TAGS", clone({}), {
      transform: transformCaseFunc
    });
    FORBID_ATTR = _resolveSetOption(cfg, "FORBID_ATTR", clone({}), {
      transform: transformCaseFunc
    });
    USE_PROFILES = objectHasOwnProperty(cfg, "USE_PROFILES") ? cfg.USE_PROFILES && typeof cfg.USE_PROFILES === "object" ? clone(cfg.USE_PROFILES) : cfg.USE_PROFILES : false;
    ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false;
    ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false;
    ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false;
    ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false;
    SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false;
    SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false;
    WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false;
    RETURN_DOM = cfg.RETURN_DOM || false;
    RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false;
    RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false;
    FORCE_BODY = cfg.FORCE_BODY || false;
    SANITIZE_DOM = cfg.SANITIZE_DOM !== false;
    SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false;
    KEEP_CONTENT = cfg.KEEP_CONTENT !== false;
    IN_PLACE = cfg.IN_PLACE || false;
    IS_ALLOWED_URI$1 = isRegex(cfg.ALLOWED_URI_REGEXP) ? cfg.ALLOWED_URI_REGEXP : IS_ALLOWED_URI;
    NAMESPACE = typeof cfg.NAMESPACE === "string" ? cfg.NAMESPACE : HTML_NAMESPACE;
    MATHML_TEXT_INTEGRATION_POINTS = objectHasOwnProperty(cfg, "MATHML_TEXT_INTEGRATION_POINTS") && cfg.MATHML_TEXT_INTEGRATION_POINTS && typeof cfg.MATHML_TEXT_INTEGRATION_POINTS === "object" ? clone(cfg.MATHML_TEXT_INTEGRATION_POINTS) : addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
    HTML_INTEGRATION_POINTS = objectHasOwnProperty(cfg, "HTML_INTEGRATION_POINTS") && cfg.HTML_INTEGRATION_POINTS && typeof cfg.HTML_INTEGRATION_POINTS === "object" ? clone(cfg.HTML_INTEGRATION_POINTS) : addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
    const customElementHandling = objectHasOwnProperty(cfg, "CUSTOM_ELEMENT_HANDLING") && cfg.CUSTOM_ELEMENT_HANDLING && typeof cfg.CUSTOM_ELEMENT_HANDLING === "object" ? clone(cfg.CUSTOM_ELEMENT_HANDLING) : create(null);
    CUSTOM_ELEMENT_HANDLING = create(null);
    if (objectHasOwnProperty(customElementHandling, "tagNameCheck") && isRegexOrFunction(customElementHandling.tagNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.tagNameCheck = customElementHandling.tagNameCheck;
    }
    if (objectHasOwnProperty(customElementHandling, "attributeNameCheck") && isRegexOrFunction(customElementHandling.attributeNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.attributeNameCheck = customElementHandling.attributeNameCheck;
    }
    if (objectHasOwnProperty(customElementHandling, "allowCustomizedBuiltInElements") && typeof customElementHandling.allowCustomizedBuiltInElements === "boolean") {
      CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = customElementHandling.allowCustomizedBuiltInElements;
    }
    seal(CUSTOM_ELEMENT_HANDLING);
    if (SAFE_FOR_TEMPLATES) {
      ALLOW_DATA_ATTR = false;
    }
    if (RETURN_DOM_FRAGMENT) {
      RETURN_DOM = true;
    }
    if (USE_PROFILES) {
      ALLOWED_TAGS = addToSet({}, text);
      ALLOWED_ATTR = create(null);
      if (USE_PROFILES.html === true) {
        addToSet(ALLOWED_TAGS, html$1);
        addToSet(ALLOWED_ATTR, html);
      }
      if (USE_PROFILES.svg === true) {
        addToSet(ALLOWED_TAGS, svg$1);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.svgFilters === true) {
        addToSet(ALLOWED_TAGS, svgFilters);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.mathMl === true) {
        addToSet(ALLOWED_TAGS, mathMl$1);
        addToSet(ALLOWED_ATTR, mathMl);
        addToSet(ALLOWED_ATTR, xml);
      }
    }
    EXTRA_ELEMENT_HANDLING.tagCheck = null;
    EXTRA_ELEMENT_HANDLING.attributeCheck = null;
    if (objectHasOwnProperty(cfg, "ADD_TAGS")) {
      if (typeof cfg.ADD_TAGS === "function") {
        EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
      } else if (arrayIsArray(cfg.ADD_TAGS)) {
        if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
          ALLOWED_TAGS = clone(ALLOWED_TAGS);
        }
        addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, "ADD_ATTR")) {
      if (typeof cfg.ADD_ATTR === "function") {
        EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
      } else if (arrayIsArray(cfg.ADD_ATTR)) {
        if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
          ALLOWED_ATTR = clone(ALLOWED_ATTR);
        }
        addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, "ADD_URI_SAFE_ATTR") && arrayIsArray(cfg.ADD_URI_SAFE_ATTR)) {
      addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR, transformCaseFunc);
    }
    if (objectHasOwnProperty(cfg, "FORBID_CONTENTS") && arrayIsArray(cfg.FORBID_CONTENTS)) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.FORBID_CONTENTS, transformCaseFunc);
    }
    if (objectHasOwnProperty(cfg, "ADD_FORBID_CONTENTS") && arrayIsArray(cfg.ADD_FORBID_CONTENTS)) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
    }
    if (KEEP_CONTENT) {
      ALLOWED_TAGS["#text"] = true;
    }
    if (WHOLE_DOCUMENT) {
      addToSet(ALLOWED_TAGS, ["html", "head", "body"]);
    }
    if (ALLOWED_TAGS.table) {
      addToSet(ALLOWED_TAGS, ["tbody"]);
      delete FORBID_TAGS.tbody;
    }
    if (cfg.TRUSTED_TYPES_POLICY) {
      if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== "function") {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
      }
      if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== "function") {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
      }
      const previousTrustedTypesPolicy = trustedTypesPolicy;
      trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
      try {
        emptyHTML = _createTrustedHTML("");
      } catch (error) {
        trustedTypesPolicy = previousTrustedTypesPolicy;
        throw error;
      }
    } else if (cfg.TRUSTED_TYPES_POLICY === null) {
      trustedTypesPolicy = void 0;
      emptyHTML = "";
    } else {
      if (trustedTypesPolicy === void 0) {
        trustedTypesPolicy = _getDefaultTrustedTypesPolicy();
      }
      if (trustedTypesPolicy && typeof emptyHTML === "string") {
        emptyHTML = _createTrustedHTML("");
      }
    }
    if (freeze) {
      freeze(cfg);
    }
    CONFIG = cfg;
  };
  const ALL_SVG_TAGS = addToSet({}, [...svg$1, ...svgFilters, ...svgDisallowed]);
  const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
  const _checkSvgNamespace = function _checkSvgNamespace2(tagName, parent, parentTagName) {
    if (parent.namespaceURI === HTML_NAMESPACE) {
      return tagName === "svg";
    }
    if (parent.namespaceURI === MATHML_NAMESPACE) {
      return tagName === "svg" && (parentTagName === "annotation-xml" || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
    }
    return Boolean(ALL_SVG_TAGS[tagName]);
  };
  const _checkMathMlNamespace = function _checkMathMlNamespace2(tagName, parent, parentTagName) {
    if (parent.namespaceURI === HTML_NAMESPACE) {
      return tagName === "math";
    }
    if (parent.namespaceURI === SVG_NAMESPACE) {
      return tagName === "math" && HTML_INTEGRATION_POINTS[parentTagName];
    }
    return Boolean(ALL_MATHML_TAGS[tagName]);
  };
  const _checkHtmlNamespace = function _checkHtmlNamespace2(tagName, parent, parentTagName) {
    if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) {
      return false;
    }
    if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) {
      return false;
    }
    return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
  };
  const _checkValidNamespace = function _checkValidNamespace2(element) {
    let parent = getParentNode(element);
    if (!parent || !parent.tagName) {
      parent = {
        namespaceURI: NAMESPACE,
        tagName: "template"
      };
    }
    const tagName = stringToLowerCase(element.tagName);
    const parentTagName = stringToLowerCase(parent.tagName);
    if (!ALLOWED_NAMESPACES[element.namespaceURI]) {
      return false;
    }
    if (element.namespaceURI === SVG_NAMESPACE) {
      return _checkSvgNamespace(tagName, parent, parentTagName);
    }
    if (element.namespaceURI === MATHML_NAMESPACE) {
      return _checkMathMlNamespace(tagName, parent, parentTagName);
    }
    if (element.namespaceURI === HTML_NAMESPACE) {
      return _checkHtmlNamespace(tagName, parent, parentTagName);
    }
    if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && ALLOWED_NAMESPACES[element.namespaceURI]) {
      return true;
    }
    return false;
  };
  const _forceRemove = function _forceRemove2(node) {
    arrayPush(DOMPurify.removed, {
      element: node
    });
    try {
      getParentNode(node).removeChild(node);
    } catch (_) {
      remove(node);
      if (!getParentNode(node)) {
        throw typeErrorCreate("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place");
      }
    }
  };
  const _neutralizeRoot = function _neutralizeRoot2(root) {
    _neutralizeSubtree(root);
    const childNodes = getChildNodes(root);
    if (childNodes) {
      const snapshot = [];
      arrayForEach(childNodes, (child) => {
        arrayPush(snapshot, child);
      });
      arrayForEach(snapshot, (child) => {
        try {
          remove(child);
        } catch (_) {
        }
      });
    }
    const attributes = getAttributes(root);
    if (attributes) {
      for (let i = attributes.length - 1; i >= 0; --i) {
        const attribute = attributes[i];
        const name = attribute && attribute.name;
        if (typeof name === "string") {
          try {
            root.removeAttribute(name);
          } catch (_) {
          }
        }
      }
    }
  };
  const _removeAttribute = function _removeAttribute2(name, element) {
    try {
      arrayPush(DOMPurify.removed, {
        attribute: element.getAttributeNode(name),
        from: element
      });
    } catch (_) {
      arrayPush(DOMPurify.removed, {
        attribute: null,
        from: element
      });
    }
    element.removeAttribute(name);
    if (name === "is") {
      if (RETURN_DOM || RETURN_DOM_FRAGMENT) {
        try {
          _forceRemove(element);
        } catch (_) {
        }
      } else {
        try {
          element.setAttribute(name, "");
        } catch (_) {
        }
      }
    }
  };
  const _stripDisallowedAttributes = function _stripDisallowedAttributes2(element) {
    const attributes = getAttributes(element);
    if (!attributes) {
      return;
    }
    for (let i = attributes.length - 1; i >= 0; --i) {
      const attribute = attributes[i];
      const name = attribute && attribute.name;
      if (typeof name !== "string" || ALLOWED_ATTR[transformCaseFunc(name)]) {
        continue;
      }
      try {
        element.removeAttribute(name);
      } catch (_) {
      }
    }
  };
  const _neutralizeSubtree = function _neutralizeSubtree2(root) {
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
      if (nodeType === NODE_TYPE.element) {
        _stripDisallowedAttributes(node);
      }
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i = childNodes.length - 1; i >= 0; --i) {
          stack.push(childNodes[i]);
        }
      }
    }
  };
  const _neutralizePatchLinkage = function _neutralizePatchLinkage2(root) {
    if (!SAFE_FOR_XML) {
      return;
    }
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
      if (nodeType === NODE_TYPE.processingInstruction || nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, node.data)) {
        try {
          remove(node);
        } catch (_) {
        }
        continue;
      }
      if (nodeType === NODE_TYPE.element) {
        const element = node;
        const lcTag = transformCaseFunc(getNodeName ? getNodeName(node) : node.nodeName);
        try {
          if (element.hasAttribute && element.hasAttribute("patchsrc")) {
            element.removeAttribute("patchsrc");
          }
          if (element.hasAttribute && element.hasAttribute("for") && lcTag !== "label" && lcTag !== "output") {
            element.removeAttribute("for");
          }
        } catch (_) {
        }
      }
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i = childNodes.length - 1; i >= 0; --i) {
          stack.push(childNodes[i]);
        }
      }
    }
  };
  const _initDocument = function _initDocument2(dirty) {
    let doc = null;
    let leadingWhitespace = null;
    if (FORCE_BODY) {
      dirty = "<remove></remove>" + dirty;
    } else {
      const matches = stringMatch(dirty, /^[\r\n\t ]+/);
      leadingWhitespace = matches && matches[0];
    }
    if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && NAMESPACE === HTML_NAMESPACE) {
      dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + "</body></html>";
    }
    const dirtyPayload = trustedTypesPolicy ? _createTrustedHTML(dirty) : dirty;
    if (NAMESPACE === HTML_NAMESPACE) {
      try {
        doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
      } catch (_) {
      }
    }
    if (!doc || !doc.documentElement) {
      doc = implementation.createDocument(NAMESPACE, "template", null);
      try {
        doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
      } catch (_) {
      }
    }
    const body = doc.body || doc.documentElement;
    if (dirty && leadingWhitespace) {
      body.insertBefore(document2.createTextNode(leadingWhitespace), body.childNodes[0] || null);
    }
    if (NAMESPACE === HTML_NAMESPACE) {
      return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? "html" : "body")[0];
    }
    return WHOLE_DOCUMENT ? doc.documentElement : body;
  };
  const _createNodeIterator = function _createNodeIterator2(root) {
    const doc = getOwnerDocument ? getOwnerDocument(root) : root.ownerDocument;
    return createNodeIterator.call(
      doc || root,
      root,
      // eslint-disable-next-line no-bitwise
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION,
      null
    );
  };
  const _stripTemplateExpressions = function _stripTemplateExpressions2(value) {
    value = stringReplace(value, MUSTACHE_EXPR$1, " ");
    value = stringReplace(value, ERB_EXPR$1, " ");
    value = stringReplace(value, TMPLIT_EXPR$1, " ");
    return value;
  };
  const _scrubTemplateExpressions2 = function _scrubTemplateExpressions(node) {
    var _node$querySelectorAl;
    node.normalize();
    const doc = getOwnerDocument ? getOwnerDocument(node) : node.ownerDocument;
    const walker = createNodeIterator.call(
      doc || node,
      node,
      // eslint-disable-next-line no-bitwise
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_CDATA_SECTION | NodeFilter.SHOW_PROCESSING_INSTRUCTION,
      null
    );
    let currentNode = walker.nextNode();
    while (currentNode) {
      currentNode.data = _stripTemplateExpressions(currentNode.data);
      currentNode = walker.nextNode();
    }
    const templates = (_node$querySelectorAl = node.querySelectorAll) === null || _node$querySelectorAl === void 0 ? void 0 : _node$querySelectorAl.call(node, "template");
    if (templates) {
      arrayForEach(templates, (tmpl) => {
        if (_isDocumentFragment(tmpl.content)) {
          _scrubTemplateExpressions2(tmpl.content);
        }
      });
    }
  };
  const _isClobbered = function _isClobbered2(element) {
    const realTagName = getNodeName ? getNodeName(element) : null;
    if (typeof realTagName !== "string") {
      return false;
    }
    if (transformCaseFunc(realTagName) !== "form") {
      return false;
    }
    return typeof element.nodeName !== "string" || typeof element.textContent !== "string" || typeof element.removeChild !== "function" || // Realm-safe NamedNodeMap detection: equality against the cached
    // prototype getter. Clobbered .attributes (e.g. <input name="attributes">)
    // makes the direct read diverge from the cached read; a clean form
    // (same-realm OR foreign-realm) has both reads pointing at the same
    // canonical NamedNodeMap.
    element.attributes !== getAttributes(element) || typeof element.removeAttribute !== "function" || typeof element.setAttribute !== "function" || typeof element.namespaceURI !== "string" || typeof element.insertBefore !== "function" || typeof element.hasChildNodes !== "function" || // NodeType clobbering probe. Cached Node.prototype.nodeType getter
    // returns the integer 1 for any Element regardless of realm; direct
    // read on a clobbered form (e.g. <input name="nodeType">) returns
    // the named child element. Cheap addition — nodeType is read from
    // an internal slot, no serialization cost — and removes a residual
    // clobbering surface used by several mXSS / PI / comment branches
    // in _sanitizeElements that compare currentNode.nodeType directly.
    element.nodeType !== getNodeType(element) || // HTMLFormElement has [LegacyOverrideBuiltIns]: a descendant named
    // "childNodes" shadows the prototype getter. Direct reads of
    // form.childNodes from a clobbered form return the named child
    // instead of the real NodeList, so any walk that reads it directly
    // skips the form's real children. Compare the direct read to the
    // cached Node.prototype getter — when the form's named-property
    // getter intercepts the read, the two values differ and we flag
    // the form. This catches every clobbering child type (input,
    // select, etc.) regardless of whether the named child happens to
    // carry a numeric .length, which a typeof-based probe would miss
    // (e.g. HTMLSelectElement.length is a defined unsigned-long).
    element.childNodes !== getChildNodes(element);
  };
  const _isDocumentFragment = function _isDocumentFragment2(value) {
    if (!getNodeType || typeof value !== "object" || value === null) {
      return false;
    }
    try {
      return getNodeType(value) === NODE_TYPE.documentFragment;
    } catch (_) {
      return false;
    }
  };
  const _isNode = function _isNode2(value) {
    if (!getNodeType || typeof value !== "object" || value === null) {
      return false;
    }
    try {
      return typeof getNodeType(value) === "number";
    } catch (_) {
      return false;
    }
  };
  function _executeHooks(hooks2, currentNode, data) {
    if (hooks2.length === 0) {
      return;
    }
    arrayForEach(hooks2, (hook) => {
      hook.call(DOMPurify, currentNode, data, CONFIG);
    });
  }
  const _isUnsafeNode = function _isUnsafeNode2(currentNode, tagName) {
    if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.textContent) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.innerHTML)) {
      return true;
    }
    if (SAFE_FOR_XML && currentNode.namespaceURI === HTML_NAMESPACE && tagName === "style" && _isNode(currentNode.firstElementChild)) {
      return true;
    }
    if (currentNode.nodeType === NODE_TYPE.processingInstruction) {
      return true;
    }
    if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, currentNode.data)) {
      return true;
    }
    return false;
  };
  const _sanitizeDisallowedNode = function _sanitizeDisallowedNode2(currentNode, tagName, root) {
    if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName)) {
      if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) {
        return false;
      }
      if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(tagName)) {
        return false;
      }
    }
    if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
      const parentNode = getParentNode(currentNode);
      const childNodes = getChildNodes(currentNode);
      if (childNodes && parentNode) {
        const childCount = childNodes.length;
        for (let i = childCount - 1; i >= 0; --i) {
          const hoisted = currentNode === root ? cloneNode(childNodes[i], true) : childNodes[i];
          parentNode.insertBefore(hoisted, getNextSibling(currentNode));
        }
      }
    }
    _forceRemove(currentNode);
    return true;
  };
  const _forkSharedAllowlist = function _forkSharedAllowlist2(hookList, set, defaultSet, setConfigSet) {
    if (hookList.length === 0) {
      return set;
    }
    return set === defaultSet || set === setConfigSet ? clone(set) : set;
  };
  const _sanitizeElements = function _sanitizeElements2(currentNode, root) {
    _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
    if (currentNode !== root && getParentNode(currentNode) === null) {
      if (IN_PLACE) {
        _neutralizeSubtree(currentNode);
      }
      return true;
    }
    if (_isClobbered(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    const tagName = transformCaseFunc(getNodeName ? getNodeName(currentNode) : currentNode.nodeName);
    ALLOWED_TAGS = _forkSharedAllowlist(hooks.uponSanitizeElement, ALLOWED_TAGS, DEFAULT_ALLOWED_TAGS, SET_CONFIG_ALLOWED_TAGS);
    _executeHooks(hooks.uponSanitizeElement, currentNode, {
      tagName,
      allowedTags: ALLOWED_TAGS
    });
    if (currentNode !== root && getParentNode(currentNode) === null) {
      if (IN_PLACE) {
        _neutralizeSubtree(currentNode);
      }
      return true;
    }
    if (_isUnsafeNode(currentNode, tagName)) {
      _forceRemove(currentNode);
      return true;
    }
    if (FORBID_TAGS[tagName] || !(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && !ALLOWED_TAGS[tagName]) {
      const removed = _sanitizeDisallowedNode(currentNode, tagName, root);
      if (removed === false) {
        _executeHooks(hooks.afterSanitizeElements, currentNode, null);
      }
      return removed;
    }
    const nt = getNodeType ? getNodeType(currentNode) : currentNode.nodeType;
    if (nt === NODE_TYPE.element && !_checkValidNamespace(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    if ((tagName === "noscript" || tagName === "noembed" || tagName === "noframes") && regExpTest(FALLBACK_TAG_CLOSE, currentNode.innerHTML)) {
      _forceRemove(currentNode);
      return true;
    }
    if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
      const content = _stripTemplateExpressions(currentNode.textContent);
      if (currentNode.textContent !== content) {
        arrayPush(DOMPurify.removed, {
          element: currentNode.cloneNode()
        });
        currentNode.textContent = content;
      }
    }
    _executeHooks(hooks.afterSanitizeElements, currentNode, null);
    return false;
  };
  const _isValidAttribute = function _isValidAttribute2(lcTag, lcName, value) {
    if (FORBID_ATTR[lcName]) {
      return false;
    }
    if (SAFE_FOR_XML && lcName === "patchsrc") {
      return false;
    }
    if (SAFE_FOR_XML && lcName === "for" && lcTag !== "label" && lcTag !== "output") {
      return false;
    }
    if (SANITIZE_DOM && (lcName === "id" || lcName === "name") && (value in document2 || value in formElement)) {
      return false;
    }
    const nameIsPermitted = ALLOWED_ATTR[lcName] || EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag);
    if (ALLOW_DATA_ATTR && regExpTest(DATA_ATTR$1, lcName)) ;
    else if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR$1, lcName)) ;
    else if (!nameIsPermitted) {
      if (
        // First condition does a very basic check if a) it's basically a valid custom element tagname AND
        // b) if the tagName passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
        // and c) if the attribute name passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.attributeNameCheck
        _isBasicCustomElement(lcTag) && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(lcTag)) && (CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName) || CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.attributeNameCheck(lcName, lcTag)) || // Alternative, second condition checks if it's an `is`-attribute, AND
        // the value passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
        lcName === "is" && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(value))
      ) ;
      else {
        return false;
      }
    } else if (URI_SAFE_ATTRIBUTES[lcName]) ;
    else if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE$1, ""))) ;
    else if ((lcName === "src" || lcName === "xlink:href" || lcName === "href") && lcTag !== "script" && stringIndexOf(value, "data:") === 0 && DATA_URI_TAGS[lcTag]) ;
    else if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA$1, stringReplace(value, ATTR_WHITESPACE$1, ""))) ;
    else if (value) {
      return false;
    } else ;
    return true;
  };
  const RESERVED_CUSTOM_ELEMENT_NAMES = addToSet({}, ["annotation-xml", "color-profile", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "missing-glyph"]);
  const _isBasicCustomElement = function _isBasicCustomElement2(tagName) {
    return !RESERVED_CUSTOM_ELEMENT_NAMES[stringToLowerCase(tagName)] && regExpTest(CUSTOM_ELEMENT$1, tagName);
  };
  const _applyTrustedTypesToAttribute = function _applyTrustedTypesToAttribute2(lcTag, lcName, namespaceURI, value) {
    if (trustedTypesPolicy && typeof trustedTypes === "object" && typeof trustedTypes.getAttributeType === "function" && !namespaceURI) {
      switch (trustedTypes.getAttributeType(lcTag, lcName)) {
        case "TrustedHTML": {
          return _createTrustedHTML(value);
        }
        case "TrustedScriptURL": {
          return _createTrustedScriptURL(value);
        }
      }
    }
    return value;
  };
  const _setAttributeValue = function _setAttributeValue2(currentNode, name, namespaceURI, value) {
    try {
      if (namespaceURI) {
        currentNode.setAttributeNS(namespaceURI, name, value);
      } else {
        currentNode.setAttribute(name, value);
      }
      if (_isClobbered(currentNode)) {
        _forceRemove(currentNode);
      } else {
        arrayPop(DOMPurify.removed);
      }
    } catch (_) {
      _removeAttribute(name, currentNode);
    }
  };
  const _sanitizeAttributes = function _sanitizeAttributes2(currentNode) {
    _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
    const attributes = currentNode.attributes;
    if (!attributes || _isClobbered(currentNode)) {
      return;
    }
    ALLOWED_ATTR = _forkSharedAllowlist(hooks.uponSanitizeAttribute, ALLOWED_ATTR, DEFAULT_ALLOWED_ATTR, SET_CONFIG_ALLOWED_ATTR);
    const hookEvent = {
      attrName: "",
      attrValue: "",
      keepAttr: true,
      allowedAttributes: ALLOWED_ATTR,
      forceKeepAttr: void 0
    };
    let l = attributes.length;
    const lcTag = transformCaseFunc(currentNode.nodeName);
    while (l--) {
      const attr = attributes[l];
      const name = attr.name, namespaceURI = attr.namespaceURI, attrValue = attr.value;
      const lcName = transformCaseFunc(name);
      const initValue = attrValue;
      let value = name === "value" ? initValue : stringTrim(initValue);
      hookEvent.attrName = lcName;
      hookEvent.attrValue = value;
      hookEvent.keepAttr = true;
      hookEvent.forceKeepAttr = void 0;
      _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
      value = hookEvent.attrValue;
      if (SANITIZE_NAMED_PROPS && (lcName === "id" || lcName === "name") && stringIndexOf(value, SANITIZE_NAMED_PROPS_PREFIX) !== 0) {
        _removeAttribute(name, currentNode);
        value = SANITIZE_NAMED_PROPS_PREFIX + value;
      }
      if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (lcName === "attributename" && stringMatch(value, "href")) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (hookEvent.forceKeepAttr) {
        continue;
      }
      if (!hookEvent.keepAttr) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(SELF_CLOSING_TAG, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (SAFE_FOR_TEMPLATES) {
        value = _stripTemplateExpressions(value);
      }
      if (!_isValidAttribute(lcTag, lcName, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      value = _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value);
      if (value !== initValue) {
        _setAttributeValue(currentNode, name, namespaceURI, value);
      }
    }
    _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
  };
  const _sanitizeShadowDOM2 = function _sanitizeShadowDOM(fragment) {
    let shadowNode = null;
    const shadowIterator = _createNodeIterator(fragment);
    _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
    while (shadowNode = shadowIterator.nextNode()) {
      _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
      _sanitizeElements(shadowNode, fragment);
      _sanitizeAttributes(shadowNode);
      if (_isDocumentFragment(shadowNode.content)) {
        _sanitizeShadowDOM2(shadowNode.content);
      }
      const shadowNodeType = getNodeType ? getNodeType(shadowNode) : shadowNode.nodeType;
      if (shadowNodeType === NODE_TYPE.element) {
        const innerSr = getShadowRoot(shadowNode);
        if (_isDocumentFragment(innerSr)) {
          _sanitizeAttachedShadowRoots(innerSr);
          _sanitizeShadowDOM2(innerSr);
        }
      }
    }
    _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
  };
  const _sanitizeAttachedShadowRoots = function _sanitizeAttachedShadowRoots2(root) {
    const stack = [{
      node: root,
      shadow: null
    }];
    while (stack.length > 0) {
      const item = stack.pop();
      if (item.shadow) {
        _sanitizeShadowDOM2(item.shadow);
        continue;
      }
      const node = item.node;
      const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
      const isElement = nodeType === NODE_TYPE.element;
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i = childNodes.length - 1; i >= 0; --i) {
          stack.push({
            node: childNodes[i],
            shadow: null
          });
        }
      }
      if (isElement) {
        const rootName = getNodeName ? getNodeName(node) : null;
        if (typeof rootName === "string" && transformCaseFunc(rootName) === "template") {
          const content = node.content;
          if (_isDocumentFragment(content)) {
            stack.push({
              node: content,
              shadow: null
            });
          }
        }
      }
      if (isElement) {
        const sr = getShadowRoot(node);
        if (_isDocumentFragment(sr)) {
          stack.push({
            node: null,
            shadow: sr
          }, {
            node: sr,
            shadow: null
          });
        }
      }
    }
  };
  DOMPurify.sanitize = function(dirty) {
    let cfg = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
    let body = null;
    let importedNode = null;
    let currentNode = null;
    let returnNode = null;
    IS_EMPTY_INPUT = !dirty;
    if (IS_EMPTY_INPUT) {
      dirty = "<!-->";
    }
    if (typeof dirty !== "string" && !_isNode(dirty)) {
      dirty = stringifyValue(dirty);
      if (typeof dirty !== "string") {
        throw typeErrorCreate("dirty is not a string, aborting");
      }
    }
    if (!DOMPurify.isSupported) {
      return dirty;
    }
    if (SET_CONFIG) {
      ALLOWED_TAGS = SET_CONFIG_ALLOWED_TAGS;
      ALLOWED_ATTR = SET_CONFIG_ALLOWED_ATTR;
    } else {
      _parseConfig(cfg);
    }
    if (hooks.uponSanitizeElement.length > 0 || hooks.uponSanitizeAttribute.length > 0) {
      ALLOWED_TAGS = clone(ALLOWED_TAGS);
    }
    if (hooks.uponSanitizeAttribute.length > 0) {
      ALLOWED_ATTR = clone(ALLOWED_ATTR);
    }
    DOMPurify.removed = [];
    const inPlace = IN_PLACE && typeof dirty !== "string" && _isNode(dirty);
    if (inPlace) {
      _neutralizePatchLinkage(dirty);
      const nn = getNodeName ? getNodeName(dirty) : dirty.nodeName;
      if (typeof nn === "string") {
        const tagName = transformCaseFunc(nn);
        if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
          _neutralizeRoot(dirty);
          throw typeErrorCreate("root node is forbidden and cannot be sanitized in-place");
        }
      }
      if (_isClobbered(dirty)) {
        _neutralizeRoot(dirty);
        throw typeErrorCreate("root node is clobbered and cannot be sanitized in-place");
      }
      try {
        _sanitizeAttachedShadowRoots(dirty);
      } catch (error) {
        _neutralizeRoot(dirty);
        throw error;
      }
    } else if (_isNode(dirty)) {
      body = _initDocument("<!---->");
      importedNode = body.ownerDocument.importNode(dirty, true);
      if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === "BODY") {
        body = importedNode;
      } else if (importedNode.nodeName === "HTML") {
        body = importedNode;
      } else {
        body.appendChild(importedNode);
      }
      _sanitizeAttachedShadowRoots(importedNode);
    } else {
      if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT && // eslint-disable-next-line unicorn/prefer-includes
      dirty.indexOf("<") === -1) {
        return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(dirty) : dirty;
      }
      body = _initDocument(dirty);
      if (!body) {
        return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : "";
      }
    }
    if (body && FORCE_BODY) {
      _forceRemove(body.firstChild);
    }
    const walkRoot = inPlace ? dirty : body;
    try {
      const nodeIterator = _createNodeIterator(walkRoot);
      while (currentNode = nodeIterator.nextNode()) {
        _sanitizeElements(currentNode, walkRoot);
        _sanitizeAttributes(currentNode);
        if (_isDocumentFragment(currentNode.content)) {
          _sanitizeShadowDOM2(currentNode.content);
        }
      }
    } catch (error) {
      if (inPlace) {
        _neutralizeRoot(dirty);
        arrayForEach(DOMPurify.removed, (entry) => {
          if (entry.element) {
            _neutralizeSubtree(entry.element);
          }
        });
      }
      throw error;
    }
    if (inPlace) {
      arrayForEach(DOMPurify.removed, (entry) => {
        if (entry.element) {
          _neutralizeSubtree(entry.element);
        }
      });
      if (SAFE_FOR_TEMPLATES) {
        _scrubTemplateExpressions2(dirty);
      }
      return dirty;
    }
    if (RETURN_DOM) {
      if (SAFE_FOR_TEMPLATES) {
        _scrubTemplateExpressions2(body);
      }
      if (RETURN_DOM_FRAGMENT) {
        returnNode = createDocumentFragment.call(body.ownerDocument);
        while (body.firstChild) {
          returnNode.appendChild(body.firstChild);
        }
      } else {
        returnNode = body;
      }
      if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) {
        returnNode = importNode.call(originalDocument, returnNode, true);
      }
      return returnNode;
    }
    let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
    if (WHOLE_DOCUMENT && ALLOWED_TAGS["!doctype"] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) {
      serializedHTML = "<!DOCTYPE " + body.ownerDocument.doctype.name + ">\n" + serializedHTML;
    }
    if (SAFE_FOR_TEMPLATES) {
      serializedHTML = _stripTemplateExpressions(serializedHTML);
    }
    return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(serializedHTML) : serializedHTML;
  };
  DOMPurify.setConfig = function() {
    let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    _parseConfig(cfg);
    SET_CONFIG = true;
    SET_CONFIG_ALLOWED_TAGS = ALLOWED_TAGS;
    SET_CONFIG_ALLOWED_ATTR = ALLOWED_ATTR;
  };
  DOMPurify.clearConfig = function() {
    CONFIG = null;
    SET_CONFIG = false;
    SET_CONFIG_ALLOWED_TAGS = null;
    SET_CONFIG_ALLOWED_ATTR = null;
    trustedTypesPolicy = defaultTrustedTypesPolicy;
    emptyHTML = "";
  };
  DOMPurify.isValidAttribute = function(tag, attr, value) {
    if (!CONFIG) {
      _parseConfig({});
    }
    const lcTag = transformCaseFunc(tag);
    const lcName = transformCaseFunc(attr);
    return _isValidAttribute(lcTag, lcName, value);
  };
  DOMPurify.addHook = function(entryPoint, hookFunction) {
    if (typeof hookFunction !== "function") {
      return;
    }
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return;
    }
    arrayPush(hooks[entryPoint], hookFunction);
  };
  DOMPurify.removeHook = function(entryPoint, hookFunction) {
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return void 0;
    }
    if (hookFunction !== void 0) {
      const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
      return index === -1 ? void 0 : arraySplice(hooks[entryPoint], index, 1)[0];
    }
    return arrayPop(hooks[entryPoint]);
  };
  DOMPurify.removeHooks = function(entryPoint) {
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return;
    }
    hooks[entryPoint] = [];
  };
  DOMPurify.removeAllHooks = function() {
    hooks = _createHooksMap();
  };
  return DOMPurify;
}
var purify = createDOMPurify();

// engine/sanitise.js
var PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["script", "iframe", "object", "embed", "svg", "math", "style", "form"],
  FORBID_ATTR: ["formaction"],
  // on* handlers are stripped by the default profile
  ALLOW_UNKNOWN_PROTOCOLS: false
};
function regexStripFallback(html2) {
  let s = String(html2 || "");
  s = s.replace(/<(script|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<\/?(?:script|iframe|object|embed|svg|math|use)\b[^>]*>/gi, "");
  const keepDelim = (m, d) => /\s/.test(d) ? "" : d;
  s = s.replace(/([\s/"'`])on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, keepDelim);
  s = s.replace(
    /([\s/"'`])(?:xlink:)?(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (m, d, dq, sq, uq) => {
      const raw = (dq !== void 0 ? dq : sq !== void 0 ? sq : uq) || "";
      const norm2 = normaliseUrl(raw);
      if (/^(?:javascript|vbscript):/.test(norm2)) return keepDelim(m, d);
      if (/^data:/.test(norm2)) return SAFE_IMAGE_DATA_URL.test(raw.trim()) ? m : keepDelim(m, d);
      return m;
    }
  );
  return s;
}
function normaliseUrl(raw) {
  return String(raw || "").replace(/&#x([0-9a-f]+);?/gi, (_m, h) => {
    try {
      return String.fromCodePoint(parseInt(h, 16));
    } catch {
      return "";
    }
  }).replace(/&#(\d+);?/g, (_m, n) => {
    try {
      return String.fromCodePoint(parseInt(n, 10));
    } catch {
      return "";
    }
  }).replace(/&colon;/gi, ":").replace(/&(?:tab|newline|nbsp);/gi, " ").replace(/[\u0000-\u0020]+/g, "").toLowerCase();
}
function purifyIsLive() {
  return typeof window !== "undefined" && purify && typeof purify.sanitize === "function";
}
function sanitiseHtml(html2) {
  const input = String(html2 ?? "");
  if (!purifyIsLive()) return regexStripFallback(input);
  try {
    return String(purify.sanitize(input, PURIFY_CONFIG));
  } catch {
    return regexStripFallback(input);
  }
}

// engine/blocks.js
function stripUnsafeHtml(html2) {
  return sanitiseHtml(String(html2 || ""));
}

// src/core/domain.js
var domain_exports = {};
__export(domain_exports, {
  GH_PAGES_A: () => GH_PAGES_A,
  cnameFileContent: () => cnameFileContent,
  dnsRecordsFor: () => dnsRecordsFor,
  isApex: () => isApex,
  isValidDomain: () => isValidDomain,
  normaliseDomain: () => normaliseDomain,
  pagesDomainStatus: () => pagesDomainStatus
});
function normaliseDomain(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/[/?#].*$/, "");
  s = s.replace(/:\d+$/, "");
  s = s.replace(/\.$/, "");
  return s;
}
function isValidDomain(input) {
  const s = normaliseDomain(input);
  if (!s || s.length > 253) return false;
  const labels = s.split(".");
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (!/^[a-z][a-z0-9-]*$/.test(tld) || tld.length < 2) return false;
  const labelRe = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  return labels.every((l) => labelRe.test(l));
}
function isApex(input) {
  const s = normaliseDomain(input);
  return isValidDomain(s) && s.split(".").length === 2;
}
function cnameFileContent(input) {
  const s = normaliseDomain(input);
  if (!isValidDomain(s)) throw new Error("Enter a valid domain, e.g. example.com");
  return s + "\n";
}
var GH_PAGES_A = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
function dnsRecordsFor(input, ghUser) {
  const s = normaliseDomain(input);
  if (!isValidDomain(s)) return [];
  const user = String(ghUser || "").trim().toLowerCase();
  const target = user ? `${user}.github.io` : "<your-user>.github.io";
  const labels = s.split(".");
  if (labels.length === 2) {
    const rows = GH_PAGES_A.map((ip) => ({ type: "A", host: "@", value: ip, note: "GitHub Pages" }));
    rows.push({ type: "CNAME", host: "www", value: target, note: "so www also works" });
    return rows;
  }
  const sub = labels.slice(0, labels.length - 2).join(".") || labels[0];
  return [{ type: "CNAME", host: sub, value: target, note: "GitHub Pages" }];
}
function pagesDomainStatus(pages, expectedInput) {
  const host = normaliseDomain(expectedInput);
  const cname = pages && pages.cname ? normaliseDomain(pages.cname) : "";
  const built = !!(pages && pages.status === "built");
  const httpsEnforced = !!(pages && pages.https_enforced);
  const cert = pages && pages.https_certificate;
  const certState = cert && cert.state ? String(cert.state) : "";
  const certReady = certState === "approved";
  const configured = !!cname;
  const matches = configured && !!host && cname === host;
  let message;
  if (!pages) {
    message = "GitHub Pages isn't reporting a site yet \u2014 publish once (or wait a moment after enabling Pages), then check again.";
  } else if (!configured) {
    message = 'No custom domain is set on GitHub yet. Add the DNS records above, press "Connect this domain", then check again in a few minutes.';
  } else if (host && !matches) {
    message = `GitHub currently has a different domain set (${cname}). Press "Connect this domain" again to switch it to ${host}.`;
  } else {
    const shown = host || cname;
    if (certReady && httpsEnforced) message = `${shown} is verified and live over HTTPS \u2713`;
    else if (certReady) message = `${shown} is verified and its HTTPS certificate is ready \u2713`;
    else message = `${shown} is set on GitHub. It's still provisioning the free HTTPS certificate \u2014 this can take a few minutes, up to an hour the first time. Check again shortly.`;
  }
  const ok = matches || configured && !host;
  return { configured, matches, cname, built, httpsEnforced, certState, certReady, ok, message };
}

// src/core/tour.js
var tour_exports = {};
__export(tour_exports, {
  TOUR_DONE_KEY: () => TOUR_DONE_KEY,
  TOUR_PENDING_KEY: () => TOUR_PENDING_KEY,
  TOUR_STEPS: () => TOUR_STEPS,
  clampStep: () => clampStep,
  clearPending: () => clearPending,
  isDone: () => isDone,
  isLastStep: () => isLastStep,
  isPending: () => isPending,
  markDone: () => markDone,
  markPending: () => markPending,
  resetTour: () => resetTour,
  shouldAutoOpen: () => shouldAutoOpen,
  tourStepAt: () => tourStepAt,
  tourStepCount: () => tourStepCount
});
var TOUR_STEPS = [
  {
    id: "template",
    section: "write",
    title: "Pick a template",
    body: "Open Write \u2192 New post and choose a starting template. It gives your first post a shape you can edit."
  },
  {
    id: "write",
    section: "write",
    title: "Write your post",
    body: "Type in the editor \u2014 a title and a few paragraphs is plenty. Everything saves to a draft as you go."
  },
  {
    id: "image",
    section: "media",
    title: "Add an image",
    body: "Use an image block (or the Darkroom) to drop in a photo. Images commit to your GitHub repo \u2014 free, no extra setup."
  },
  {
    id: "interactive",
    section: "write",
    title: "Make it interactive",
    body: "Tap \u2726 Interactive to drop in a poll, quiz, chart or timeline \u2014 pick a template, set a title, done. Or sketch a flipbook in \u25C6 Figure \u2192 Draw."
  },
  {
    id: "publish",
    section: "posts",
    title: "Publish",
    body: "Happy with it? Publish. Your post commits to your repo and GitHub Pages rebuilds your blog automatically."
  }
];
var TOUR_DONE_KEY = "helm.studio.firstPostTour.done";
var TOUR_PENDING_KEY = "helm.studio.firstPostTour.pending";
var browserStore = typeof localStorage !== "undefined" ? {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
    }
  }
} : null;
var S = (store) => store || browserStore;
function tourStepCount() {
  return TOUR_STEPS.length;
}
function clampStep(i) {
  i = Number(i);
  if (!Number.isFinite(i) || i < 0) return 0;
  const max = TOUR_STEPS.length - 1;
  return i > max ? max : Math.floor(i);
}
function tourStepAt(i) {
  return TOUR_STEPS[clampStep(i)] || null;
}
function isLastStep(i) {
  return clampStep(i) === TOUR_STEPS.length - 1;
}
function markPending(store) {
  const s = S(store);
  if (s) s.set(TOUR_PENDING_KEY, "1");
}
function clearPending(store) {
  const s = S(store);
  if (s) s.remove(TOUR_PENDING_KEY);
}
function isPending(store) {
  const s = S(store);
  return !!(s && s.get(TOUR_PENDING_KEY));
}
function markDone(store) {
  const s = S(store);
  if (s) {
    s.set(TOUR_DONE_KEY, "1");
    s.remove(TOUR_PENDING_KEY);
  }
}
function isDone(store) {
  const s = S(store);
  return !!(s && s.get(TOUR_DONE_KEY));
}
function resetTour(store) {
  const s = S(store);
  if (s) {
    s.remove(TOUR_DONE_KEY);
    s.remove(TOUR_PENDING_KEY);
  }
}
function shouldAutoOpen(store) {
  return isPending(store) && !isDone(store);
}

// src/core/quotes.js
var quotes_exports = {};
__export(quotes_exports, {
  QUOTES: () => QUOTES,
  TONES: () => TONES,
  authorFacets: () => authorFacets,
  filterQuotes: () => filterQuotes,
  formatAttribution: () => formatAttribution,
  quoteForInsert: () => quoteForInsert,
  themeFacets: () => themeFacets,
  toneFacets: () => toneFacets
});

// src/data/quotes.json
var quotes_default = {
  version: 1,
  note: "Curated public-domain / widely-attributed quotations for the Studio Quote Library. Every author is long-deceased (text in the public domain) or the line is a widely-attributed aphorism. No modern copyrighted lyrics or book passages. themes: Life, Love, Work & ambition, Creativity & art, Science & knowledge, Failure & resilience, Time, Nature, Wisdom, Humour, Freedom, Courage. tone: inspiring, wry, reflective, defiant, tender.",
  quotes: [
    { text: "The unexamined life is not worth living.", author: "Socrates", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "I know that I know nothing.", author: "Socrates", themes: ["Wisdom", "Science & knowledge"], tone: "reflective" },
    { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle", themes: ["Wisdom"], tone: "reflective" },
    { text: "It is the mark of an educated mind to be able to entertain a thought without accepting it.", author: "Aristotle", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "No man ever steps in the same river twice, for it is not the same river and he is not the same man.", author: "Heraclitus", themes: ["Time", "Wisdom", "Nature"], tone: "reflective" },
    { text: "The only thing we know is that we know nothing, and that is the highest flight of human wisdom.", author: "Leo Tolstoy", themes: ["Wisdom", "Science & knowledge"], tone: "reflective", source: "War and Peace" },
    { text: "Everyone thinks of changing the world, but no one thinks of changing himself.", author: "Leo Tolstoy", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "If you want to be happy, be.", author: "Leo Tolstoy", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "The two most powerful warriors are patience and time.", author: "Leo Tolstoy", themes: ["Time", "Wisdom"], tone: "reflective", source: "War and Peace" },
    { text: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius", themes: ["Life", "Wisdom"], tone: "defiant", source: "Meditations" },
    { text: "You have power over your mind \u2014 not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius", themes: ["Failure & resilience", "Wisdom"], tone: "defiant", source: "Meditations" },
    { text: "The happiness of your life depends upon the quality of your thoughts.", author: "Marcus Aurelius", themes: ["Life", "Wisdom"], tone: "reflective", source: "Meditations" },
    { text: "When you arise in the morning, think of what a precious privilege it is to be alive \u2014 to breathe, to think, to enjoy, to love.", author: "Marcus Aurelius", themes: ["Life", "Time"], tone: "tender", source: "Meditations" },
    { text: "We suffer more often in imagination than in reality.", author: "Seneca", themes: ["Wisdom", "Failure & resilience"], tone: "reflective" },
    { text: "Luck is what happens when preparation meets opportunity.", author: "Seneca", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca", themes: ["Time", "Life"], tone: "reflective", source: "On the Shortness of Life" },
    { text: "Difficulties strengthen the mind, as labour does the body.", author: "Seneca", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "While we wait for life, life passes.", author: "Seneca", themes: ["Time", "Life"], tone: "reflective" },
    { text: "Begin at once to live, and count each separate day as a separate life.", author: "Seneca", themes: ["Life", "Time"], tone: "inspiring" },
    { text: "No great thing is created suddenly, any more than a bunch of grapes or a fig.", author: "Epictetus", themes: ["Time", "Work & ambition", "Nature"], tone: "reflective" },
    { text: "It's not what happens to you, but how you react to it that matters.", author: "Epictetus", themes: ["Failure & resilience", "Wisdom"], tone: "defiant" },
    { text: "Wealth consists not in having great possessions, but in having few wants.", author: "Epictetus", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "He who is not contented with what he has, would not be contented with what he would like to have.", author: "Socrates", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu", themes: ["Work & ambition", "Wisdom"], tone: "inspiring", source: "Tao Te Ching" },
    { text: "Nature does not hurry, yet everything is accomplished.", author: "Lao Tzu", themes: ["Nature", "Time", "Wisdom"], tone: "reflective", source: "Tao Te Ching" },
    { text: "When I let go of what I am, I become what I might be.", author: "Lao Tzu", themes: ["Life", "Wisdom"], tone: "reflective", source: "Tao Te Ching" },
    { text: "Knowing others is wisdom; knowing yourself is enlightenment.", author: "Lao Tzu", themes: ["Wisdom", "Science & knowledge"], tone: "reflective", source: "Tao Te Ching" },
    { text: "A flower does not think of competing with the flower next to it. It just blooms.", author: "Zen proverb", themes: ["Nature", "Wisdom", "Life"], tone: "tender" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "Real knowledge is to know the extent of one's ignorance.", author: "Confucius", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "Choose a job you love, and you will never have to work a day in your life.", author: "Confucius", themes: ["Work & ambition", "Life"], tone: "inspiring" },
    { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius", themes: ["Failure & resilience", "Courage"], tone: "inspiring" },
    { text: "When it is obvious that the goals cannot be reached, don't adjust the goals, adjust the action steps.", author: "Confucius", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "Life is really simple, but we insist on making it complicated.", author: "Confucius", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "They must often change who would be constant in happiness or wisdom.", author: "Confucius", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "To be, or not to be, that is the question.", author: "William Shakespeare", themes: ["Life"], tone: "reflective", source: "Hamlet" },
    { text: "We know what we are, but know not what we may be.", author: "William Shakespeare", themes: ["Life", "Wisdom"], tone: "reflective", source: "Hamlet" },
    { text: "This above all: to thine own self be true.", author: "William Shakespeare", themes: ["Wisdom", "Life"], tone: "inspiring", source: "Hamlet" },
    { text: "The course of true love never did run smooth.", author: "William Shakespeare", themes: ["Love"], tone: "wry", source: "A Midsummer Night's Dream" },
    { text: "All the world's a stage, and all the men and women merely players.", author: "William Shakespeare", themes: ["Life"], tone: "reflective", source: "As You Like It" },
    { text: "Love all, trust a few, do wrong to none.", author: "William Shakespeare", themes: ["Love", "Wisdom"], tone: "tender", source: "All's Well That Ends Well" },
    { text: "Better three hours too soon than a minute too late.", author: "William Shakespeare", themes: ["Time"], tone: "wry", source: "The Merry Wives of Windsor" },
    { text: "Our doubts are traitors, and make us lose the good we oft might win, by fearing to attempt.", author: "William Shakespeare", themes: ["Courage", "Failure & resilience"], tone: "defiant", source: "Measure for Measure" },
    { text: "How far that little candle throws his beams! So shines a good deed in a weary world.", author: "William Shakespeare", themes: ["Wisdom", "Life"], tone: "tender", source: "The Merchant of Venice" },
    { text: "The fault, dear Brutus, is not in our stars, but in ourselves.", author: "William Shakespeare", themes: ["Life", "Wisdom"], tone: "defiant", source: "Julius Caesar" },
    { text: "Whatever you can do, or dream you can, begin it. Boldness has genius, power and magic in it.", author: "Johann Wolfgang von Goethe", themes: ["Courage", "Work & ambition"], tone: "inspiring" },
    { text: "Knowing is not enough; we must apply. Willing is not enough; we must do.", author: "Johann Wolfgang von Goethe", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "He who moves not forward, goes backward.", author: "Johann Wolfgang von Goethe", themes: ["Work & ambition", "Time"], tone: "defiant" },
    { text: "A man sees in the world what he carries in his heart.", author: "Johann Wolfgang von Goethe", themes: ["Life", "Wisdom"], tone: "reflective", source: "Faust" },
    { text: "That which does not kill us makes us stronger.", author: "Friedrich Nietzsche", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche", themes: ["Life", "Failure & resilience"], tone: "defiant" },
    { text: "And those who were seen dancing were thought to be insane by those who could not hear the music.", author: "Friedrich Nietzsche", themes: ["Creativity & art", "Wisdom"], tone: "defiant" },
    { text: "You must have chaos within you to give birth to a dancing star.", author: "Friedrich Nietzsche", themes: ["Creativity & art"], tone: "defiant", source: "Thus Spoke Zarathustra" },
    { text: "There is always some madness in love. But there is also always some reason in madness.", author: "Friedrich Nietzsche", themes: ["Love", "Wisdom"], tone: "wry" },
    { text: "Without music, life would be a mistake.", author: "Friedrich Nietzsche", themes: ["Creativity & art", "Life"], tone: "wry" },
    { text: "Imagination is more important than knowledge.", author: "Albert Einstein", themes: ["Creativity & art", "Science & knowledge"], tone: "inspiring" },
    { text: "Try not to become a man of success, but rather try to become a man of value.", author: "Albert Einstein", themes: ["Work & ambition", "Wisdom"], tone: "reflective" },
    { text: "A person who never made a mistake never tried anything new.", author: "Albert Einstein", themes: ["Failure & resilience", "Creativity & art"], tone: "inspiring" },
    { text: "Life is like riding a bicycle. To keep your balance, you must keep moving.", author: "Albert Einstein", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "The important thing is not to stop questioning. Curiosity has its own reason for existing.", author: "Albert Einstein", themes: ["Science & knowledge", "Wisdom"], tone: "inspiring" },
    { text: "Logic will get you from A to B. Imagination will take you everywhere.", author: "Albert Einstein", themes: ["Creativity & art", "Science & knowledge"], tone: "inspiring" },
    { text: "We cannot solve our problems with the same thinking we used when we created them.", author: "Albert Einstein", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "The whole of science is nothing more than a refinement of everyday thinking.", author: "Albert Einstein", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "Nothing in life is to be feared, it is only to be understood. Now is the time to understand more, so that we may fear less.", author: "Marie Curie", themes: ["Science & knowledge", "Courage"], tone: "inspiring" },
    { text: "Be less curious about people and more curious about ideas.", author: "Marie Curie", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "One never notices what has been done; one can only see what remains to be done.", author: "Marie Curie", themes: ["Work & ambition", "Failure & resilience"], tone: "reflective" },
    { text: "I have not failed. I've just found ten thousand ways that won't work.", author: "Thomas Edison", themes: ["Failure & resilience", "Science & knowledge"], tone: "defiant" },
    { text: "Genius is one percent inspiration and ninety-nine percent perspiration.", author: "Thomas Edison", themes: ["Work & ambition", "Creativity & art"], tone: "wry" },
    { text: "Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time.", author: "Thomas Edison", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "If we did all the things we are capable of, we would literally astound ourselves.", author: "Thomas Edison", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "There's a way to do it better \u2014 find it.", author: "Thomas Edison", themes: ["Work & ambition", "Creativity & art"], tone: "defiant" },
    { text: "Whatever the mind of man can conceive and believe, it can achieve.", author: "Napoleon Hill", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela", themes: ["Failure & resilience", "Courage"], tone: "inspiring" },
    { text: "Do not judge me by my successes, judge me by how many times I fell down and got back up again.", author: "Nelson Mandela", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela", themes: ["Science & knowledge", "Freedom"], tone: "inspiring" },
    { text: "May your choices reflect your hopes, not your fears.", author: "Nelson Mandela", themes: ["Courage", "Life"], tone: "inspiring" },
    { text: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi", themes: ["Life", "Wisdom"], tone: "inspiring" },
    { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi", themes: ["Life", "Science & knowledge", "Time"], tone: "inspiring" },
    { text: "The future depends on what you do today.", author: "Mahatma Gandhi", themes: ["Time", "Work & ambition"], tone: "inspiring" },
    { text: "Strength does not come from physical capacity. It comes from an indomitable will.", author: "Mahatma Gandhi", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "In a gentle way, you can shake the world.", author: "Mahatma Gandhi", themes: ["Courage", "Freedom"], tone: "inspiring" },
    { text: "Darkness cannot drive out darkness; only light can do that.", author: "Martin Luther King Jr.", themes: ["Wisdom", "Freedom"], tone: "inspiring" },
    { text: "The time is always right to do what is right.", author: "Martin Luther King Jr.", themes: ["Courage", "Wisdom"], tone: "defiant" },
    { text: "Faith is taking the first step even when you don't see the whole staircase.", author: "Martin Luther King Jr.", themes: ["Courage", "Failure & resilience"], tone: "inspiring" },
    { text: "Injustice anywhere is a threat to justice everywhere.", author: "Martin Luther King Jr.", themes: ["Freedom", "Wisdom"], tone: "defiant" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "If you're going through hell, keep going.", author: "Winston Churchill", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "A pessimist sees the difficulty in every opportunity; an optimist sees the opportunity in every difficulty.", author: "Winston Churchill", themes: ["Wisdom", "Failure & resilience"], tone: "wry" },
    { text: "We make a living by what we get, but we make a life by what we give.", author: "Winston Churchill", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "Courage is what it takes to stand up and speak; courage is also what it takes to sit down and listen.", author: "Winston Churchill", themes: ["Courage", "Wisdom"], tone: "wry" },
    { text: "Now this is not the end. It is not even the beginning of the end. But it is, perhaps, the end of the beginning.", author: "Winston Churchill", themes: ["Time", "Failure & resilience"], tone: "defiant" },
    { text: "Nearly all men can stand adversity, but if you want to test a man's character, give him power.", author: "Abraham Lincoln", themes: ["Wisdom", "Courage"], tone: "reflective" },
    { text: "Whatever you are, be a good one.", author: "Abraham Lincoln", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "The best way to predict your future is to create it.", author: "Abraham Lincoln", themes: ["Time", "Work & ambition"], tone: "inspiring" },
    { text: "In the end, it's not the years in your life that count. It's the life in your years.", author: "Abraham Lincoln", themes: ["Life", "Time"], tone: "reflective" },
    { text: "Give me six hours to chop down a tree and I will spend the first four sharpening the axe.", author: "Abraham Lincoln", themes: ["Work & ambition", "Wisdom"], tone: "wry" },
    { text: "Most folks are about as happy as they make up their minds to be.", author: "Abraham Lincoln", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt", themes: ["Work & ambition", "Failure & resilience"], tone: "inspiring" },
    { text: "Nothing in the world is worth having or worth doing unless it means effort, pain, difficulty.", author: "Theodore Roosevelt", themes: ["Work & ambition", "Failure & resilience"], tone: "defiant" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", themes: ["Courage", "Work & ambition"], tone: "inspiring" },
    { text: "Comparison is the thief of joy.", author: "Theodore Roosevelt", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "The only thing we have to fear is fear itself.", author: "Franklin D. Roosevelt", themes: ["Courage", "Failure & resilience"], tone: "defiant" },
    { text: "When you reach the end of your rope, tie a knot in it and hang on.", author: "Franklin D. Roosevelt", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "It is not the critic who counts; the credit belongs to the man who is actually in the arena.", author: "Theodore Roosevelt", themes: ["Courage", "Failure & resilience"], tone: "defiant" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "No one can make you feel inferior without your consent.", author: "Eleanor Roosevelt", themes: ["Courage", "Wisdom"], tone: "defiant" },
    { text: "Do one thing every day that scares you.", author: "Eleanor Roosevelt", themes: ["Courage"], tone: "defiant" },
    { text: "Great minds discuss ideas; average minds discuss events; small minds discuss people.", author: "Eleanor Roosevelt", themes: ["Wisdom", "Science & knowledge"], tone: "wry" },
    { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin", themes: ["Science & knowledge", "Work & ambition"], tone: "wry" },
    { text: "Lost time is never found again.", author: "Benjamin Franklin", themes: ["Time"], tone: "reflective" },
    { text: "Either write something worth reading or do something worth writing.", author: "Benjamin Franklin", themes: ["Creativity & art", "Work & ambition"], tone: "defiant" },
    { text: "Well done is better than well said.", author: "Benjamin Franklin", themes: ["Work & ambition", "Wisdom"], tone: "wry" },
    { text: "By failing to prepare, you are preparing to fail.", author: "Benjamin Franklin", themes: ["Failure & resilience", "Work & ambition"], tone: "wry" },
    { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin", themes: ["Work & ambition", "Failure & resilience"], tone: "inspiring" },
    { text: "Twenty years from now you will be more disappointed by the things that you didn't do than by the ones you did do.", author: "Mark Twain", themes: ["Life", "Courage", "Time"], tone: "reflective" },
    { text: "The two most important days in your life are the day you are born and the day you find out why.", author: "Mark Twain", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "Whenever you find yourself on the side of the majority, it is time to pause and reflect.", author: "Mark Twain", themes: ["Wisdom", "Courage"], tone: "wry" },
    { text: "Kindness is the language which the deaf can hear and the blind can see.", author: "Mark Twain", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "Courage is resistance to fear, mastery of fear \u2014 not absence of fear.", author: "Mark Twain", themes: ["Courage"], tone: "defiant" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain", themes: ["Work & ambition"], tone: "wry" },
    { text: "Get your facts first, then you can distort them as you please.", author: "Mark Twain", themes: ["Humour", "Wisdom"], tone: "wry" },
    { text: "I have never let my schooling interfere with my education.", author: "Mark Twain", themes: ["Humour", "Science & knowledge"], tone: "wry" },
    { text: "A lie can travel halfway around the world while the truth is still putting on its shoes.", author: "Mark Twain", themes: ["Humour", "Wisdom"], tone: "wry" },
    { text: "Be yourself; everyone else is already taken.", author: "Oscar Wilde", themes: ["Life", "Humour"], tone: "wry" },
    { text: "We are all in the gutter, but some of us are looking at the stars.", author: "Oscar Wilde", themes: ["Life", "Courage"], tone: "wry", source: "Lady Windermere's Fan" },
    { text: "I can resist everything except temptation.", author: "Oscar Wilde", themes: ["Humour"], tone: "wry", source: "Lady Windermere's Fan" },
    { text: "Experience is simply the name we give our mistakes.", author: "Oscar Wilde", themes: ["Failure & resilience", "Humour"], tone: "wry", source: "Lady Windermere's Fan" },
    { text: "To live is the rarest thing in the world. Most people exist, that is all.", author: "Oscar Wilde", themes: ["Life"], tone: "reflective" },
    { text: "The truth is rarely pure and never simple.", author: "Oscar Wilde", themes: ["Wisdom", "Humour"], tone: "wry", source: "The Importance of Being Earnest" },
    { text: "Anyone who has never made a mistake has never tried anything new.", author: "Oscar Wilde", themes: ["Failure & resilience", "Creativity & art"], tone: "wry" },
    { text: "Always forgive your enemies; nothing annoys them so much.", author: "Oscar Wilde", themes: ["Humour", "Wisdom"], tone: "wry" },
    { text: "A cynic is a man who knows the price of everything and the value of nothing.", author: "Oscar Wilde", themes: ["Wisdom", "Humour"], tone: "wry", source: "Lady Windermere's Fan" },
    { text: "The man who does not read good books has no advantage over the man who cannot read them.", author: "Mark Twain", themes: ["Science & knowledge", "Creativity & art"], tone: "wry" },
    { text: "There is no greater agony than bearing an untold story inside you.", author: "Maya Angelou", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "You may not control all the events that happen to you, but you can decide not to be reduced by them.", author: "Maya Angelou", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "I've learned that people will forget what you said, but people will never forget how you made them feel.", author: "Maya Angelou", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "Try to be a rainbow in someone's cloud.", author: "Maya Angelou", themes: ["Love", "Life"], tone: "tender" },
    { text: "We may encounter many defeats but we must not be defeated.", author: "Maya Angelou", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "Two roads diverged in a wood, and I \u2014 I took the one less traveled by, and that has made all the difference.", author: "Robert Frost", themes: ["Life", "Courage"], tone: "reflective", source: "The Road Not Taken" },
    { text: "In three words I can sum up everything I've learned about life: it goes on.", author: "Robert Frost", themes: ["Life", "Time"], tone: "wry" },
    { text: "The best way out is always through.", author: "Robert Frost", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "Hope is the thing with feathers that perches in the soul.", author: "Emily Dickinson", themes: ["Failure & resilience", "Creativity & art"], tone: "tender" },
    { text: "Dwell in possibility.", author: "Emily Dickinson", themes: ["Creativity & art", "Life"], tone: "inspiring" },
    { text: "Forever is composed of nows.", author: "Emily Dickinson", themes: ["Time", "Life"], tone: "reflective" },
    { text: "I dwell in possibility \u2014 a fairer house than prose.", author: "Emily Dickinson", themes: ["Creativity & art"], tone: "reflective" },
    { text: "And now here is my secret, a very simple secret: it is only with the heart that one can see rightly; what is essential is invisible to the eye.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Love", "Wisdom"], tone: "tender", source: "The Little Prince" },
    { text: "A goal without a plan is just a wish.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Work & ambition"], tone: "wry" },
    { text: "If you want to build a ship, don't drum up people to gather wood \u2014 teach them to long for the endless immensity of the sea.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Work & ambition", "Creativity & art"], tone: "inspiring" },
    { text: "Love does not consist of gazing at each other, but in looking outward together in the same direction.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Love"], tone: "tender" },
    { text: "What is essential is invisible to the eye.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Love", "Wisdom"], tone: "tender", source: "The Little Prince" },
    { text: "All grown-ups were once children, although few of them remember it.", author: "Antoine de Saint-Exup\xE9ry", themes: ["Life", "Time"], tone: "tender", source: "The Little Prince" },
    { text: "The cure for boredom is curiosity. There is no cure for curiosity.", author: "Dorothy Parker", themes: ["Science & knowledge", "Humour"], tone: "wry" },
    { text: "Writing is not necessarily something to be ashamed of, but do it in private and wash your hands afterwards.", author: "Robert A. Heinlein", themes: ["Creativity & art", "Humour"], tone: "wry" },
    { text: "The more I read, the more I acquire, the more certain I am that I know nothing.", author: "Voltaire", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "Judge a man by his questions rather than by his answers.", author: "Voltaire", themes: ["Wisdom", "Science & knowledge"], tone: "reflective" },
    { text: "Common sense is not so common.", author: "Voltaire", themes: ["Wisdom", "Humour"], tone: "wry" },
    { text: "Perfect is the enemy of good.", author: "Voltaire", themes: ["Work & ambition", "Wisdom"], tone: "wry" },
    { text: "Let us cultivate our garden.", author: "Voltaire", themes: ["Nature", "Work & ambition"], tone: "reflective", source: "Candide" },
    { text: "Cherish those who seek the truth but beware of those who find it.", author: "Voltaire", themes: ["Wisdom", "Science & knowledge"], tone: "wry" },
    { text: "Man is born free, and everywhere he is in chains.", author: "Jean-Jacques Rousseau", themes: ["Freedom"], tone: "defiant", source: "The Social Contract" },
    { text: "Patience is bitter, but its fruit is sweet.", author: "Jean-Jacques Rousseau", themes: ["Time", "Wisdom"], tone: "reflective" },
    { text: "I cannot live without books.", author: "Thomas Jefferson", themes: ["Science & knowledge", "Creativity & art"], tone: "tender" },
    { text: "Do you want to know who you are? Don't ask. Act. Action will delineate and define you.", author: "Thomas Jefferson", themes: ["Life", "Work & ambition"], tone: "defiant" },
    { text: "Honesty is the first chapter in the book of wisdom.", author: "Thomas Jefferson", themes: ["Wisdom"], tone: "reflective" },
    { text: "I'm a great believer in luck, and I find the harder I work the more I have of it.", author: "Thomas Jefferson", themes: ["Work & ambition", "Humour"], tone: "wry" },
    { text: "He who knows best knows how little he knows.", author: "Thomas Jefferson", themes: ["Wisdom", "Science & knowledge"], tone: "reflective" },
    { text: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Ralph Waldo Emerson", themes: ["Failure & resilience", "Courage"], tone: "inspiring" },
    { text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson", themes: ["Courage", "Wisdom"], tone: "inspiring" },
    { text: "To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.", author: "Ralph Waldo Emerson", themes: ["Courage", "Life"], tone: "defiant" },
    { text: "Do not go where the path may lead, go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson", themes: ["Courage", "Creativity & art"], tone: "defiant" },
    { text: "Write it on your heart that every day is the best day in the year.", author: "Ralph Waldo Emerson", themes: ["Life", "Time"], tone: "tender" },
    { text: "The earth laughs in flowers.", author: "Ralph Waldo Emerson", themes: ["Nature", "Creativity & art"], tone: "tender" },
    { text: "Adopt the pace of nature: her secret is patience.", author: "Ralph Waldo Emerson", themes: ["Nature", "Time", "Wisdom"], tone: "reflective" },
    { text: "Nothing great was ever achieved without enthusiasm.", author: "Ralph Waldo Emerson", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "Go confidently in the direction of your dreams. Live the life you have imagined.", author: "Henry David Thoreau", themes: ["Life", "Courage"], tone: "inspiring" },
    { text: "I went to the woods because I wished to live deliberately.", author: "Henry David Thoreau", themes: ["Nature", "Life"], tone: "reflective", source: "Walden" },
    { text: "Not until we are lost do we begin to understand ourselves.", author: "Henry David Thoreau", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "It's not what you look at that matters, it's what you see.", author: "Henry David Thoreau", themes: ["Wisdom", "Creativity & art"], tone: "reflective" },
    { text: "Live in each season as it passes; breathe the air, drink the drink, taste the fruit.", author: "Henry David Thoreau", themes: ["Nature", "Life", "Time"], tone: "tender" },
    { text: "Heaven is under our feet as well as over our heads.", author: "Henry David Thoreau", themes: ["Nature", "Wisdom"], tone: "reflective", source: "Walden" },
    { text: "Beware of all enterprises that require new clothes.", author: "Henry David Thoreau", themes: ["Wisdom", "Humour"], tone: "wry", source: "Walden" },
    { text: "The mass of men lead lives of quiet desperation.", author: "Henry David Thoreau", themes: ["Life"], tone: "reflective", source: "Walden" },
    { text: "What you get by achieving your goals is not as important as what you become by achieving your goals.", author: "Henry David Thoreau", themes: ["Work & ambition", "Life"], tone: "reflective" },
    { text: "Keep your face always toward the sunshine \u2014 and shadows will fall behind you.", author: "Walt Whitman", themes: ["Life", "Courage"], tone: "tender" },
    { text: "I exist as I am, that is enough.", author: "Walt Whitman", themes: ["Life", "Courage"], tone: "defiant", source: "Leaves of Grass" },
    { text: "Do I contradict myself? Very well then I contradict myself, I am large, I contain multitudes.", author: "Walt Whitman", themes: ["Life", "Creativity & art"], tone: "defiant", source: "Leaves of Grass" },
    { text: "Resist much, obey little.", author: "Walt Whitman", themes: ["Freedom", "Courage"], tone: "defiant", source: "Leaves of Grass" },
    { text: "Keep your eyes on the stars, and your feet on the ground.", author: "Theodore Roosevelt", themes: ["Courage", "Wisdom"], tone: "inspiring" },
    { text: "Look deep into nature, and then you will understand everything better.", author: "Albert Einstein", themes: ["Nature", "Science & knowledge"], tone: "reflective" },
    { text: "Adopt the pace of the seasons; nature never rushes, yet all is done.", author: "Lao Tzu", themes: ["Nature", "Time"], tone: "reflective" },
    { text: "To plant a garden is to believe in tomorrow.", author: "Audrey Hepburn", themes: ["Nature", "Time"], tone: "tender" },
    { text: "Happiness is not something ready-made. It comes from your own actions.", author: "Dalai Lama XIV", themes: ["Life", "Wisdom"], tone: "inspiring" },
    { text: "Give the ones you love wings to fly, roots to come back, and reasons to stay.", author: "Dalai Lama XIV", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "Love is composed of a single soul inhabiting two bodies.", author: "Aristotle", themes: ["Love"], tone: "tender" },
    { text: "Where there is love there is life.", author: "Mahatma Gandhi", themes: ["Love", "Life"], tone: "tender" },
    { text: "The best thing to hold onto in life is each other.", author: "Audrey Hepburn", themes: ["Love", "Life"], tone: "tender" },
    { text: "We are most alive when we're in love.", author: "John Updike", themes: ["Love", "Life"], tone: "tender" },
    { text: "Love is friendship that has caught fire.", author: "Ann Landers", themes: ["Love"], tone: "tender" },
    { text: "A friend is one who knows you and loves you just the same.", author: "Elbert Hubbard", themes: ["Love", "Life"], tone: "tender" },
    { text: "Friendship is the only cement that will ever hold the world together.", author: "Woodrow Wilson", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "There is only one happiness in this life, to love and be loved.", author: "George Sand", themes: ["Love", "Life"], tone: "tender" },
    { text: "Tis better to have loved and lost than never to have loved at all.", author: "Alfred, Lord Tennyson", themes: ["Love", "Failure & resilience"], tone: "tender", source: "In Memoriam A.H.H." },
    { text: "How do I love thee? Let me count the ways.", author: "Elizabeth Barrett Browning", themes: ["Love"], tone: "tender", source: "Sonnets from the Portuguese" },
    { text: "Whatever our souls are made of, his and mine are the same.", author: "Emily Bront\xEB", themes: ["Love"], tone: "tender", source: "Wuthering Heights" },
    { text: "You pierce my soul. I am half agony, half hope.", author: "Jane Austen", themes: ["Love"], tone: "tender", source: "Persuasion" },
    { text: "There is no charm equal to tenderness of heart.", author: "Jane Austen", themes: ["Love", "Wisdom"], tone: "tender", source: "Emma" },
    { text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.", author: "Jane Austen", themes: ["Love", "Humour"], tone: "wry", source: "Pride and Prejudice" },
    { text: "The person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.", author: "Jane Austen", themes: ["Creativity & art", "Humour"], tone: "wry", source: "Northanger Abbey" },
    { text: "We accept the love we think we deserve.", author: "Plato", themes: ["Love", "Wisdom"], tone: "reflective" },
    { text: "At the touch of love everyone becomes a poet.", author: "Plato", themes: ["Love", "Creativity & art"], tone: "tender" },
    { text: "Wise men speak because they have something to say; fools because they have to say something.", author: "Plato", themes: ["Wisdom", "Humour"], tone: "wry" },
    { text: "The beginning is the most important part of the work.", author: "Plato", themes: ["Work & ambition", "Wisdom"], tone: "reflective", source: "The Republic" },
    { text: "Necessity is the mother of invention.", author: "Plato", themes: ["Creativity & art", "Science & knowledge"], tone: "wry" },
    { text: "Courage is knowing what not to fear.", author: "Plato", themes: ["Courage", "Wisdom"], tone: "reflective" },
    { text: "Every artist was first an amateur.", author: "Ralph Waldo Emerson", themes: ["Creativity & art", "Work & ambition"], tone: "inspiring" },
    { text: "Creativity takes courage.", author: "Henri Matisse", themes: ["Creativity & art", "Courage"], tone: "defiant" },
    { text: "Art washes away from the soul the dust of everyday life.", author: "Pablo Picasso", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "Every child is an artist. The problem is how to remain an artist once we grow up.", author: "Pablo Picasso", themes: ["Creativity & art", "Life"], tone: "wry" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso", themes: ["Work & ambition"], tone: "inspiring" },
    { text: "I am always doing that which I cannot do, in order that I may learn how to do it.", author: "Pablo Picasso", themes: ["Creativity & art", "Failure & resilience"], tone: "defiant" },
    { text: "Inspiration exists, but it has to find you working.", author: "Pablo Picasso", themes: ["Creativity & art", "Work & ambition"], tone: "wry" },
    { text: "A painter should begin every canvas with a wash of black, because all things in nature are dark except where exposed by the light.", author: "Leonardo da Vinci", themes: ["Creativity & art", "Nature"], tone: "reflective" },
    { text: "Learning never exhausts the mind.", author: "Leonardo da Vinci", themes: ["Science & knowledge"], tone: "inspiring" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci", themes: ["Creativity & art", "Wisdom"], tone: "reflective" },
    { text: "Art is never finished, only abandoned.", author: "Leonardo da Vinci", themes: ["Creativity & art"], tone: "wry" },
    { text: "Obstacles cannot crush me. Every obstacle yields to stern resolve.", author: "Leonardo da Vinci", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "The noblest pleasure is the joy of understanding.", author: "Leonardo da Vinci", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "I would rather die of passion than of boredom.", author: "Vincent van Gogh", themes: ["Life", "Creativity & art"], tone: "defiant" },
    { text: "Great things are done by a series of small things brought together.", author: "Vincent van Gogh", themes: ["Work & ambition", "Creativity & art"], tone: "inspiring" },
    { text: "I dream my painting and I paint my dream.", author: "Vincent van Gogh", themes: ["Creativity & art"], tone: "tender" },
    { text: "Normality is a paved road: it's comfortable to walk but no flowers grow on it.", author: "Vincent van Gogh", themes: ["Creativity & art", "Life"], tone: "defiant" },
    { text: "If you hear a voice within you say 'you cannot paint,' then by all means paint, and that voice will be silenced.", author: "Vincent van Gogh", themes: ["Creativity & art", "Courage"], tone: "defiant" },
    { text: "The aim of art is to represent not the outward appearance of things, but their inward significance.", author: "Aristotle", themes: ["Creativity & art"], tone: "reflective" },
    { text: "Music is the silence between the notes.", author: "Claude Debussy", themes: ["Creativity & art"], tone: "reflective" },
    { text: "Music is a higher revelation than all wisdom and philosophy.", author: "Ludwig van Beethoven", themes: ["Creativity & art", "Wisdom"], tone: "inspiring" },
    { text: "To play a wrong note is insignificant; to play without passion is inexcusable.", author: "Ludwig van Beethoven", themes: ["Creativity & art"], tone: "defiant" },
    { text: "Don't only practice your art, but force your way into its secrets.", author: "Ludwig van Beethoven", themes: ["Creativity & art", "Work & ambition"], tone: "defiant" },
    { text: "The poet is the priest of the invisible.", author: "Wallace Stevens", themes: ["Creativity & art"], tone: "reflective" },
    { text: "A word after a word after a word is power.", author: "Margaret Atwood", themes: ["Creativity & art"], tone: "defiant" },
    { text: "Fill your paper with the breathings of your heart.", author: "William Wordsworth", themes: ["Creativity & art"], tone: "tender" },
    { text: "Poetry is the spontaneous overflow of powerful feelings.", author: "William Wordsworth", themes: ["Creativity & art"], tone: "reflective", source: "Lyrical Ballads" },
    { text: "The world is too much with us; late and soon, getting and spending, we lay waste our powers.", author: "William Wordsworth", themes: ["Life", "Nature"], tone: "reflective" },
    { text: "Beauty is truth, truth beauty \u2014 that is all ye know on earth, and all ye need to know.", author: "John Keats", themes: ["Creativity & art", "Wisdom"], tone: "reflective", source: "Ode on a Grecian Urn" },
    { text: "A thing of beauty is a joy for ever.", author: "John Keats", themes: ["Creativity & art", "Nature"], tone: "tender", source: "Endymion" },
    { text: "Heard melodies are sweet, but those unheard are sweeter.", author: "John Keats", themes: ["Creativity & art"], tone: "reflective", source: "Ode on a Grecian Urn" },
    { text: "If I had more time, I would have written a shorter letter.", author: "Blaise Pascal", themes: ["Creativity & art", "Time", "Humour"], tone: "wry" },
    { text: "The heart has its reasons of which reason knows nothing.", author: "Blaise Pascal", themes: ["Love", "Wisdom"], tone: "reflective" },
    { text: "All of humanity's problems stem from man's inability to sit quietly in a room alone.", author: "Blaise Pascal", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "I think, therefore I am.", author: "Ren\xE9 Descartes", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "It is not enough to have a good mind; the main thing is to use it well.", author: "Ren\xE9 Descartes", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "If I have seen further it is by standing on the shoulders of giants.", author: "Isaac Newton", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "I do not know what I may appear to the world, but to myself I seem to have been only like a boy playing on the seashore.", author: "Isaac Newton", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "Eppur si muove \u2014 and yet it moves.", author: "Galileo Galilei", themes: ["Science & knowledge", "Courage"], tone: "defiant" },
    { text: "All truths are easy to understand once they are discovered; the point is to discover them.", author: "Galileo Galilei", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "Measure what is measurable, and make measurable what is not so.", author: "Galileo Galilei", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "Somewhere, something incredible is waiting to be known.", author: "Carl Sagan", themes: ["Science & knowledge"], tone: "inspiring" },
    { text: "We are made of star-stuff.", author: "Carl Sagan", themes: ["Science & knowledge", "Nature"], tone: "inspiring" },
    { text: "Extraordinary claims require extraordinary evidence.", author: "Carl Sagan", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "Science is a way of thinking much more than it is a body of knowledge.", author: "Carl Sagan", themes: ["Science & knowledge"], tone: "reflective" },
    { text: "The good thing about science is that it's true whether or not you believe in it.", author: "Neil deGrasse Tyson", themes: ["Science & knowledge"], tone: "wry" },
    { text: "Equipped with his five senses, man explores the universe around him and calls the adventure science.", author: "Edwin Hubble", themes: ["Science & knowledge"], tone: "inspiring" },
    { text: "Time is the wisest counsellor of all.", author: "Pericles", themes: ["Time", "Wisdom"], tone: "reflective" },
    { text: "Time you enjoy wasting is not wasted time.", author: "Marthe Troly-Curtin", themes: ["Time", "Life", "Humour"], tone: "wry" },
    { text: "Yesterday is history, tomorrow is a mystery, today is a gift.", author: "Alice Morse Earle", themes: ["Time", "Life"], tone: "tender" },
    { text: "Dost thou love life? Then do not squander time, for that is the stuff life is made of.", author: "Benjamin Franklin", themes: ["Time", "Life"], tone: "reflective" },
    { text: "The trouble is, you think you have time.", author: "Buddha", themes: ["Time", "Life"], tone: "reflective" },
    { text: "Better than a thousand hollow words, is one word that brings peace.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "Three things cannot be long hidden: the sun, the moon, and the truth.", author: "Buddha", themes: ["Wisdom"], tone: "reflective" },
    { text: "What we think, we become.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "Peace comes from within. Do not seek it without.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "No one saves us but ourselves. We ourselves must walk the path.", author: "Buddha", themes: ["Wisdom", "Courage"], tone: "defiant" },
    { text: "Holding on to anger is like grasping a hot coal with the intent of throwing it at someone else; you are the one who gets burned.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "However many holy words you read, however many you speak, what good will they do you if you do not act upon them?", author: "Buddha", themes: ["Wisdom", "Work & ambition"], tone: "defiant" },
    { text: "The mind is everything. What you think you become.", author: "Buddha", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "Fall seven times, stand up eight.", author: "Japanese proverb", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "The bamboo that bends is stronger than the oak that resists.", author: "Japanese proverb", themes: ["Failure & resilience", "Nature"], tone: "reflective" },
    { text: "A journey of healing begins by naming the wound.", author: "Proverb", themes: ["Failure & resilience", "Wisdom"], tone: "tender" },
    { text: "Smooth seas do not make skilful sailors.", author: "African proverb", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "If you want to go fast, go alone. If you want to go far, go together.", author: "African proverb", themes: ["Wisdom", "Work & ambition"], tone: "reflective" },
    { text: "However long the night, the dawn will break.", author: "African proverb", themes: ["Failure & resilience", "Time"], tone: "inspiring" },
    { text: "When the music changes, so does the dance.", author: "African proverb", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "A bird does not sing because it has an answer. It sings because it has a song.", author: "Chinese proverb", themes: ["Creativity & art", "Nature"], tone: "tender" },
    { text: "The best time to plant a tree was twenty years ago. The second best time is now.", author: "Chinese proverb", themes: ["Time", "Work & ambition", "Nature"], tone: "inspiring" },
    { text: "A gem cannot be polished without friction, nor a man perfected without trials.", author: "Chinese proverb", themes: ["Failure & resilience"], tone: "reflective" },
    { text: "Be not afraid of growing slowly, be afraid only of standing still.", author: "Chinese proverb", themes: ["Work & ambition", "Failure & resilience"], tone: "defiant" },
    { text: "Tension is who you think you should be. Relaxation is who you are.", author: "Chinese proverb", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "A book is a dream that you hold in your hand.", author: "Neil Gaiman", themes: ["Creativity & art"], tone: "tender" },
    { text: "We read to know we are not alone.", author: "C. S. Lewis", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "You are never too old to set another goal or to dream a new dream.", author: "C. S. Lewis", themes: ["Work & ambition", "Life"], tone: "inspiring" },
    { text: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C. S. Lewis", themes: ["Failure & resilience", "Courage"], tone: "inspiring" },
    { text: "Integrity is doing the right thing, even when no one is watching.", author: "C. S. Lewis", themes: ["Wisdom", "Courage"], tone: "reflective" },
    { text: "There are far better things ahead than any we leave behind.", author: "C. S. Lewis", themes: ["Time", "Failure & resilience"], tone: "inspiring" },
    { text: "Not all those who wander are lost.", author: "J. R. R. Tolkien", themes: ["Life", "Courage"], tone: "reflective", source: "The Fellowship of the Ring" },
    { text: "Little by little, one travels far.", author: "J. R. R. Tolkien", themes: ["Work & ambition", "Time"], tone: "inspiring" },
    { text: "It's the job that's never started as takes longest to finish.", author: "J. R. R. Tolkien", themes: ["Work & ambition", "Humour"], tone: "wry" },
    { text: "Faithless is he that says farewell when the road darkens.", author: "J. R. R. Tolkien", themes: ["Courage", "Love"], tone: "defiant" },
    { text: "All we have to decide is what to do with the time that is given us.", author: "J. R. R. Tolkien", themes: ["Time", "Courage"], tone: "reflective", source: "The Fellowship of the Ring" },
    { text: "The world breaks everyone, and afterward, some are strong at the broken places.", author: "Ernest Hemingway", themes: ["Failure & resilience"], tone: "reflective", source: "A Farewell to Arms" },
    { text: "Courage is grace under pressure.", author: "Ernest Hemingway", themes: ["Courage"], tone: "reflective" },
    { text: "There is nothing to writing. All you do is sit down at a typewriter and bleed.", author: "Ernest Hemingway", themes: ["Creativity & art", "Work & ambition"], tone: "wry" },
    { text: "But man is not made for defeat. A man can be destroyed but not defeated.", author: "Ernest Hemingway", themes: ["Failure & resilience", "Courage"], tone: "defiant", source: "The Old Man and the Sea" },
    { text: "All you need is the plan, the road map, and the courage to press on to your destination.", author: "Earl Nightingale", themes: ["Work & ambition", "Courage"], tone: "inspiring" },
    { text: "Whether you think you can, or you think you can't \u2014 you're right.", author: "Henry Ford", themes: ["Work & ambition", "Courage"], tone: "defiant" },
    { text: "Failure is simply the opportunity to begin again, this time more intelligently.", author: "Henry Ford", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "Coming together is a beginning; keeping together is progress; working together is success.", author: "Henry Ford", themes: ["Work & ambition", "Wisdom"], tone: "inspiring" },
    { text: "Quality means doing it right when no one is looking.", author: "Henry Ford", themes: ["Work & ambition", "Wisdom"], tone: "reflective" },
    { text: "Obstacles are those frightful things you see when you take your eyes off your goal.", author: "Henry Ford", themes: ["Failure & resilience", "Work & ambition"], tone: "defiant" },
    { text: "I am not a product of my circumstances. I am a product of my decisions.", author: "Stephen Covey", themes: ["Life", "Courage"], tone: "defiant" },
    { text: "Sell your cleverness and buy bewilderment.", author: "Rumi", themes: ["Wisdom", "Creativity & art"], tone: "reflective" },
    { text: "The wound is the place where the light enters you.", author: "Rumi", themes: ["Failure & resilience", "Wisdom"], tone: "tender" },
    { text: "What you seek is seeking you.", author: "Rumi", themes: ["Love", "Life"], tone: "tender" },
    { text: "Raise your words, not your voice. It is rain that grows flowers, not thunder.", author: "Rumi", themes: ["Wisdom", "Nature"], tone: "tender" },
    { text: "Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.", author: "Rumi", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "You were born with wings, why prefer to crawl through life?", author: "Rumi", themes: ["Courage", "Freedom"], tone: "defiant" },
    { text: "Let yourself be silently drawn by the strange pull of what you really love.", author: "Rumi", themes: ["Love", "Life"], tone: "tender" },
    { text: "Out beyond ideas of wrongdoing and rightdoing, there is a field. I'll meet you there.", author: "Rumi", themes: ["Wisdom", "Love"], tone: "tender" },
    { text: "When you do things from your soul, you feel a river moving in you, a joy.", author: "Rumi", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "The quieter you become, the more you are able to hear.", author: "Rumi", themes: ["Wisdom"], tone: "reflective" },
    { text: "A room without books is like a body without a soul.", author: "Marcus Tullius Cicero", themes: ["Creativity & art", "Science & knowledge"], tone: "tender" },
    { text: "If you have a garden and a library, you have everything you need.", author: "Marcus Tullius Cicero", themes: ["Nature", "Science & knowledge"], tone: "tender" },
    { text: "The life of the dead is placed in the memory of the living.", author: "Marcus Tullius Cicero", themes: ["Time", "Life"], tone: "reflective" },
    { text: "Gratitude is not only the greatest of virtues, but the parent of all others.", author: "Marcus Tullius Cicero", themes: ["Wisdom", "Life"], tone: "reflective" },
    { text: "While there's life, there's hope.", author: "Marcus Tullius Cicero", themes: ["Failure & resilience", "Life"], tone: "inspiring" },
    { text: "I came, I saw, I conquered.", author: "Julius Caesar", themes: ["Courage", "Work & ambition"], tone: "defiant" },
    { text: "It is better to die on your feet than to live on your knees.", author: "Emiliano Zapata", themes: ["Freedom", "Courage"], tone: "defiant" },
    { text: "Give me liberty, or give me death!", author: "Patrick Henry", themes: ["Freedom", "Courage"], tone: "defiant" },
    { text: "Those who deny freedom to others deserve it not for themselves.", author: "Abraham Lincoln", themes: ["Freedom", "Wisdom"], tone: "defiant" },
    { text: "Freedom is never voluntarily given by the oppressor; it must be demanded by the oppressed.", author: "Martin Luther King Jr.", themes: ["Freedom", "Courage"], tone: "defiant" },
    { text: "For to be free is not merely to cast off one's chains, but to live in a way that respects and enhances the freedom of others.", author: "Nelson Mandela", themes: ["Freedom", "Wisdom"], tone: "reflective" },
    { text: "Better to light a candle than to curse the darkness.", author: "Chinese proverb", themes: ["Wisdom", "Courage"], tone: "inspiring" },
    { text: "The unexamined life may not be worth living, but the unlived life is not worth examining.", author: "Proverb", themes: ["Life", "Wisdom"], tone: "wry" },
    { text: "Life is what happens to us while we are making other plans.", author: "Allen Saunders", themes: ["Life", "Time"], tone: "wry" },
    { text: "Everything you can imagine is real.", author: "Pablo Picasso", themes: ["Creativity & art", "Life"], tone: "inspiring" },
    { text: "I would rather walk with a friend in the dark, than alone in the light.", author: "Helen Keller", themes: ["Love", "Life"], tone: "tender" },
    { text: "Although the world is full of suffering, it is also full of the overcoming of it.", author: "Helen Keller", themes: ["Failure & resilience", "Life"], tone: "inspiring" },
    { text: "Life is either a daring adventure or nothing at all.", author: "Helen Keller", themes: ["Life", "Courage"], tone: "defiant" },
    { text: "The best and most beautiful things in the world cannot be seen or even touched \u2014 they must be felt with the heart.", author: "Helen Keller", themes: ["Love", "Wisdom"], tone: "tender" },
    { text: "Alone we can do so little; together we can do so much.", author: "Helen Keller", themes: ["Work & ambition", "Love"], tone: "inspiring" },
    { text: "Keep your face to the sunshine and you cannot see a shadow.", author: "Helen Keller", themes: ["Life", "Courage"], tone: "inspiring" },
    { text: "When one door of happiness closes, another opens; but often we look so long at the closed door that we do not see the one which has been opened for us.", author: "Helen Keller", themes: ["Failure & resilience", "Life"], tone: "reflective" },
    { text: "Reading is to the mind what exercise is to the body.", author: "Joseph Addison", themes: ["Science & knowledge", "Creativity & art"], tone: "reflective" },
    { text: "He who opens a school door, closes a prison.", author: "Victor Hugo", themes: ["Science & knowledge", "Freedom"], tone: "inspiring" },
    { text: "Even the darkest night will end and the sun will rise.", author: "Victor Hugo", themes: ["Failure & resilience", "Time"], tone: "inspiring", source: "Les Mis\xE9rables" },
    { text: "To love another person is to see the face of God.", author: "Victor Hugo", themes: ["Love"], tone: "tender", source: "Les Mis\xE9rables" },
    { text: "Music expresses that which cannot be said and on which it is impossible to be silent.", author: "Victor Hugo", themes: ["Creativity & art"], tone: "reflective" },
    { text: "Laughter is the sun that drives winter from the human face.", author: "Victor Hugo", themes: ["Humour", "Life"], tone: "tender" },
    { text: "A day without laughter is a day wasted.", author: "Charlie Chaplin", themes: ["Humour", "Life"], tone: "wry" },
    { text: "Life is a tragedy when seen in close-up, but a comedy in long-shot.", author: "Charlie Chaplin", themes: ["Humour", "Life"], tone: "wry" },
    { text: "You'll never find a rainbow if you're looking down.", author: "Charlie Chaplin", themes: ["Life", "Courage"], tone: "inspiring" },
    { text: "The reports of my death are greatly exaggerated.", author: "Mark Twain", themes: ["Humour"], tone: "wry" },
    { text: "I am so clever that sometimes I don't understand a single word of what I am saying.", author: "Oscar Wilde", themes: ["Humour"], tone: "wry" },
    { text: "Some cause happiness wherever they go; others whenever they go.", author: "Oscar Wilde", themes: ["Humour", "Life"], tone: "wry" },
    { text: "I am not young enough to know everything.", author: "Oscar Wilde", themes: ["Humour", "Wisdom"], tone: "wry" },
    { text: "Procrastination is the thief of time.", author: "Edward Young", themes: ["Time", "Work & ambition"], tone: "wry" },
    { text: "Do not wait to strike till the iron is hot; but make it hot by striking.", author: "William Butler Yeats", themes: ["Work & ambition", "Courage"], tone: "defiant" },
    { text: "Education is not the filling of a pail, but the lighting of a fire.", author: "William Butler Yeats", themes: ["Science & knowledge"], tone: "inspiring" },
    { text: "There are no strangers here; only friends you haven't yet met.", author: "William Butler Yeats", themes: ["Love", "Life"], tone: "tender" },
    { text: "Tread softly because you tread on my dreams.", author: "William Butler Yeats", themes: ["Love", "Creativity & art"], tone: "tender" },
    { text: "Happiness is when what you think, what you say, and what you do are in harmony.", author: "Mahatma Gandhi", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "First they ignore you, then they laugh at you, then they fight you, then you win.", author: "Mahatma Gandhi", themes: ["Courage", "Failure & resilience"], tone: "defiant" },
    { text: "An eye for an eye only ends up making the whole world blind.", author: "Mahatma Gandhi", themes: ["Wisdom", "Freedom"], tone: "reflective" },
    { text: "The weak can never forgive. Forgiveness is the attribute of the strong.", author: "Mahatma Gandhi", themes: ["Wisdom", "Courage"], tone: "reflective" },
    { text: "Earth provides enough to satisfy every man's needs, but not every man's greed.", author: "Mahatma Gandhi", themes: ["Nature", "Wisdom"], tone: "reflective" },
    { text: "I have learned over the years that when one's mind is made up, this diminishes fear.", author: "Rosa Parks", themes: ["Courage", "Freedom"], tone: "defiant" },
    { text: "You must never be fearful about what you are doing when it is right.", author: "Rosa Parks", themes: ["Courage"], tone: "defiant" },
    { text: "I would have girls regard themselves not as adjectives but as nouns.", author: "Elizabeth Cady Stanton", themes: ["Freedom", "Courage"], tone: "defiant" },
    { text: "The most common way people give up their power is by thinking they don't have any.", author: "Alice Walker", themes: ["Courage", "Freedom"], tone: "defiant" },
    { text: "In the depth of winter, I finally learned that within me there lay an invincible summer.", author: "Albert Camus", themes: ["Failure & resilience", "Nature"], tone: "defiant" },
    { text: "Real generosity toward the future lies in giving all to the present.", author: "Albert Camus", themes: ["Time", "Life"], tone: "reflective" },
    { text: "You will never be happy if you continue to search for what happiness consists of.", author: "Albert Camus", themes: ["Life", "Wisdom"], tone: "reflective" },
    { text: "Don't walk behind me; I may not lead. Don't walk in front of me; I may not follow. Just walk beside me and be my friend.", author: "Albert Camus", themes: ["Love", "Life"], tone: "tender" },
    { text: "Should I kill myself, or have a cup of coffee?", author: "Albert Camus", themes: ["Life", "Humour"], tone: "wry" },
    { text: "He who has never failed somewhere, that man cannot be great.", author: "Herman Melville", themes: ["Failure & resilience"], tone: "defiant" },
    { text: "It is better to fail in originality than to succeed in imitation.", author: "Herman Melville", themes: ["Creativity & art", "Failure & resilience"], tone: "defiant" },
    { text: "Whenever I feel like criticizing anyone, just remember that all the people in this world haven't had the advantages that you've had.", author: "F. Scott Fitzgerald", themes: ["Wisdom", "Life"], tone: "reflective", source: "The Great Gatsby" },
    { text: "That is part of the beauty of all literature. You discover that your longings are universal longings.", author: "F. Scott Fitzgerald", themes: ["Creativity & art", "Life"], tone: "tender" },
    { text: "Vitality shows in not only the ability to persist but the ability to start over.", author: "F. Scott Fitzgerald", themes: ["Failure & resilience", "Work & ambition"], tone: "inspiring" },
    { text: "The most wasted of all days is one without laughter.", author: "E. E. Cummings", themes: ["Humour", "Life"], tone: "wry" },
    { text: "It takes courage to grow up and become who you really are.", author: "E. E. Cummings", themes: ["Courage", "Life"], tone: "defiant" },
    { text: "Once we accept our limits, we go beyond them.", author: "Albert Einstein", themes: ["Failure & resilience", "Courage"], tone: "defiant" },
    { text: "Wherever you go, go with all your heart.", author: "Confucius", themes: ["Life", "Work & ambition"], tone: "inspiring" },
    { text: "To know what you know and what you do not know, that is true knowledge.", author: "Confucius", themes: ["Science & knowledge", "Wisdom"], tone: "reflective" },
    { text: "When anger rises, think of the consequences.", author: "Confucius", themes: ["Wisdom"], tone: "reflective" },
    { text: "The superior man is modest in his speech, but exceeds in his actions.", author: "Confucius", themes: ["Work & ambition", "Wisdom"], tone: "reflective" },
    { text: "Everything has beauty, but not everyone sees it.", author: "Confucius", themes: ["Creativity & art", "Wisdom"], tone: "reflective" }
  ]
};

// src/core/quotes.js
var QUOTES = Object.freeze(
  (Array.isArray(quotes_default?.quotes) ? quotes_default.quotes : []).map((q, i) => Object.freeze({
    id: "q" + i,
    text: String(q.text || "").trim(),
    author: String(q.author || "Unknown").trim() || "Unknown",
    themes: Array.isArray(q.themes) ? q.themes.map(String) : [],
    tone: String(q.tone || "").trim(),
    source: q.source ? String(q.source).trim() : ""
  })).filter((q) => q.text)
);
var TONES = ["inspiring", "wry", "reflective", "defiant", "tender"];
function tally(pairs) {
  const m = /* @__PURE__ */ new Map();
  for (const k of pairs) m.set(k, (m.get(k) || 0) + 1);
  return m;
}
function byCountThenName(a, b) {
  return b.count - a.count || a.value.localeCompare(b.value);
}
function themeFacets(list = QUOTES) {
  const m = tally(list.flatMap((q) => q.themes));
  return [...m].map(([value, count]) => ({ value, count })).sort(byCountThenName);
}
function toneFacets(list = QUOTES) {
  const m = tally(list.map((q) => q.tone).filter(Boolean));
  return TONES.filter((t) => m.has(t)).map((t) => ({ value: t, count: m.get(t) }));
}
function authorFacets(list = QUOTES) {
  const m = tally(list.map((q) => q.author));
  return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
}
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’“”]/g, "'").trim();
}
function matchesQuery(q, terms) {
  if (!terms.length) return true;
  const hay = norm(q.text + " " + q.author + " " + q.source);
  return terms.every((t) => hay.includes(t));
}
function filterQuotes(facets = {}, list = QUOTES) {
  const themes = (facets.themes || []).filter(Boolean);
  const authors = (facets.authors || []).filter(Boolean);
  const tones = (facets.tones || []).filter(Boolean);
  const terms = norm(facets.query).split(/\s+/).filter(Boolean);
  return list.filter(
    (q) => (!themes.length || q.themes.some((t) => themes.includes(t))) && (!authors.length || authors.includes(q.author)) && (!tones.length || tones.includes(q.tone)) && matchesQuery(q, terms)
  );
}
function formatAttribution(q) {
  if (!q) return "";
  const author = (q.author || "").trim();
  const source = (q.source || "").trim();
  if (!author && !source) return "";
  if (source && author) return author + ", " + source;
  return author || source;
}
function quoteForInsert(q) {
  return { text: (q?.text || "").trim(), cite: formatAttribution(q) };
}

// src/core/postCalendar.js
var postCalendar_exports = {};
__export(postCalendar_exports, {
  MAX_YEAR: () => MAX_YEAR,
  MIN_YEAR: () => MIN_YEAR,
  MONTHS_SHORT: () => MONTHS_SHORT,
  WEEKDAYS: () => WEEKDAYS,
  agendaForMonth: () => agendaForMonth,
  bucketPostsByDay: () => bucketPostsByDay,
  buildMonthGrid: () => buildMonthGrid,
  clampYear: () => clampYear,
  classifyPost: () => classifyPost,
  dayLabel: () => dayLabel,
  isScheduled: () => isScheduled,
  monthLabel: () => monthLabel,
  monthOf: () => monthOf,
  nextMonth: () => nextMonth,
  postDateFor: () => postDateFor,
  postsForDay: () => postsForDay,
  prevMonth: () => prevMonth,
  setMonthYear: () => setMonthYear,
  stepMonth: () => stepMonth,
  toISODate: () => toISODate
});
function isScheduled(p) {
  return !!(p && p.draft && p.publishAt);
}
function classifyPost(p) {
  if (isScheduled(p)) return "scheduled";
  if (p && p.draft) return "draft";
  return "live";
}
function toISODate(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function postDateFor(p) {
  if (!p) return "";
  if (isScheduled(p)) {
    const d = new Date(p.publishAt);
    return isNaN(d) ? "" : toISODate(d);
  }
  const raw = p.date || "";
  return raw ? String(raw).slice(0, 10) : "";
}
function bucketPostsByDay(posts) {
  const byDay = /* @__PURE__ */ new Map();
  for (const p of posts || []) {
    const key = postDateFor(p);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
  }
  const rank = { live: 0, scheduled: 1, draft: 2 };
  for (const arr of byDay.values()) {
    arr.sort((a, b) => {
      const r = rank[classifyPost(a)] - rank[classifyPost(b)];
      if (r) return r;
      return String(a.title || a.slug || "").localeCompare(String(b.title || b.slug || ""));
    });
  }
  return byDay;
}
function postsForDay(byDay, iso) {
  if (!byDay || typeof byDay.get !== "function" || !iso) return [];
  return byDay.get(iso) || [];
}
function buildMonthGrid(year, month, todayISO = toISODate(/* @__PURE__ */ new Date())) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toISODate(d);
    cells.push({
      iso,
      day: d.getDate(),
      inMonth: d.getMonth() === month && d.getFullYear() === year,
      isToday: iso === todayISO
    });
  }
  return cells;
}
function stepMonth({ year, month }, delta) {
  const m = month + delta;
  return { year: year + Math.floor(m / 12), month: (m % 12 + 12) % 12 };
}
function prevMonth(ym) {
  return stepMonth(ym, -1);
}
function nextMonth(ym) {
  return stepMonth(ym, 1);
}
var MIN_YEAR = 1970;
var MAX_YEAR = 2999;
function clampYear(year) {
  const y = Math.trunc(Number(year));
  if (!Number.isFinite(y)) return MIN_YEAR;
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, y));
}
function setMonthYear(year, month) {
  const m = Math.trunc(Number(month));
  const cm = Number.isFinite(m) ? Math.min(11, Math.max(0, m)) : 0;
  return { year: clampYear(year), month: cm };
}
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
function monthLabel({ year, month }) {
  return `${MONTHS[(month % 12 + 12) % 12]} ${year}`;
}
function dayLabel(iso) {
  const d = /* @__PURE__ */ new Date(String(iso) + "T00:00:00");
  if (isNaN(d)) return "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${wd} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function monthOf(d = /* @__PURE__ */ new Date()) {
  return { year: d.getFullYear(), month: d.getMonth() };
}
var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function agendaForMonth(byDay, year, month) {
  const out = [];
  for (const [iso, posts] of byDay.entries()) {
    const d = /* @__PURE__ */ new Date(iso + "T00:00:00");
    if (isNaN(d) || d.getFullYear() !== year || d.getMonth() !== month) continue;
    out.push({ iso, day: d.getDate(), posts });
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

// src/core/shareIntents.js
var shareIntents_exports = {};
__export(shareIntents_exports, {
  PLATFORM_CAP: () => PLATFORM_CAP,
  SHARE_PLATFORMS: () => SHARE_PLATFORMS,
  absoluteImageUrl: () => absoluteImageUrl,
  buildIntent: () => buildIntent,
  displayShareUrl: () => displayShareUrl,
  normaliseOrigin: () => normaliseOrigin,
  postImageUrls: () => postImageUrls,
  postLiveUrl: () => postLiveUrl,
  shareIntents: () => shareIntents,
  shareSheetText: () => shareSheetText,
  shareableUrl: () => shareableUrl
});
var DEFAULT_ORIGIN = "https://inayatpanda.com";
function normaliseOrigin(origin) {
  const raw = String(origin || "").trim();
  if (!raw) return DEFAULT_ORIGIN;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return DEFAULT_ORIGIN;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  } catch {
    return DEFAULT_ORIGIN;
  }
  if (!u.origin || u.origin === "null" || !/^https?:$/.test(u.protocol)) return DEFAULT_ORIGIN;
  const path = u.pathname.replace(/\/+$/g, "");
  return u.origin + (path === "/" ? "" : path);
}
function displayShareUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  return s.replace(/^https?:\/\//i, "");
}
function shareableUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(mailto|tel):/i.test(s)) return s;
  return "https://" + s.replace(/^\/+/, "");
}
function postLiveUrl(slug, origin) {
  const s = String(slug || "").replace(/^\/+|\/+$/g, "");
  if (!s) return "";
  return normaliseOrigin(origin) + "/blog/" + s + "/";
}
function absoluteImageUrl(ref, origin) {
  const r = String(ref || "").trim();
  if (!r) return "";
  if (/^data:/i.test(r) || /^https?:\/\//i.test(r)) return r;
  if (r.startsWith("/")) return normaliseOrigin(origin) + r;
  return "";
}
function postImageUrls(doc, data, { slug = "", origin } = {}) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (ref, label) => {
    const url = absoluteImageUrl(ref, origin);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, label });
  };
  const fileUrl = (file) => slug && file ? "/images/posts/" + slug + "/" + file : "";
  if (data && data.image) push(data.image, "Cover");
  for (const b of doc && Array.isArray(doc.blocks) ? doc.blocks : []) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "image") {
      push(b.src || b.url || fileUrl(b.file), "Image");
    } else if (b.type === "figure" && b.base) {
      push(b.base.src || b.base.url || fileUrl(b.base.file), "Figure");
    } else if (b.type === "gallery" && Array.isArray(b.images)) {
      for (const im of b.images) {
        if (!im) continue;
        push(im.src || im.url || fileUrl(im.file), "Gallery");
      }
    }
  }
  return out;
}
var PLATFORM_CAP = {
  x: { label: "X", prefillsText: true, prefillsUrl: true, copyLines: false, webIntent: true },
  linkedin: { label: "LinkedIn", prefillsText: false, prefillsUrl: true, copyLines: true, webIntent: true },
  facebook: { label: "Facebook", prefillsText: false, prefillsUrl: true, copyLines: true, webIntent: true },
  instagram: { label: "Instagram", prefillsText: false, prefillsUrl: false, copyLines: true, webIntent: false }
};
var SHARE_PLATFORMS = ["x", "linkedin", "facebook", "instagram"];
function buildIntent(platform, { lines = "", url = "" } = {}) {
  const key = String(platform || "").toLowerCase();
  const cap = PLATFORM_CAP[key];
  if (!cap) return null;
  const text2 = String(lines || "");
  const link = String(url || "");
  let href = null;
  if (key === "x") {
    const qs = [];
    if (text2) qs.push("text=" + encodeURIComponent(text2));
    if (link) qs.push("url=" + encodeURIComponent(link));
    href = "https://twitter.com/intent/tweet" + (qs.length ? "?" + qs.join("&") : "");
  } else if (key === "linkedin") {
    href = link ? "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(link) : "https://www.linkedin.com/feed/?shareActive=true";
  } else if (key === "facebook") {
    href = link ? "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(link) : "https://www.facebook.com/";
  } else if (key === "instagram") {
    href = null;
  }
  const note = !cap.webIntent ? "No web composer \u2014 your text is copied; paste it into Instagram." : cap.copyLines ? "Opens the share dialog with your link. Your text is copied \u2014 paste it in." : "Opens pre-filled with your text and link.";
  return { platform: key, label: cap.label, href, prefillsText: cap.prefillsText, copyLines: cap.copyLines, webIntent: cap.webIntent, note };
}
function shareIntents({ lines = "", url = "" } = {}) {
  return SHARE_PLATFORMS.map((p) => buildIntent(p, { lines, url })).filter(Boolean);
}
function shareSheetText(lines, url) {
  const t = String(lines || "").trim();
  const u = String(url || "").trim();
  if (t && u) return t + "\n\n" + u;
  return t || u;
}

// src/core/postList.js
var postList_exports = {};
__export(postList_exports, {
  isAlreadyDeleted: () => isAlreadyDeleted,
  removeBySlug: () => removeBySlug
});
function removeBySlug(posts, slug) {
  if (!Array.isArray(posts)) return [];
  return posts.filter((p) => p && p.slug !== slug);
}
function isAlreadyDeleted(err) {
  if (!err) return false;
  if (Number(err.status) === 404) return true;
  const text2 = String(err.message || err.detail || "").toLowerCase();
  return /\bnot found\b|already (?:deleted|gone)/.test(text2);
}

// src/core/connection.js
var connection_exports = {};
__export(connection_exports, {
  blogUrl: () => blogUrl,
  isDeadToken: () => isDeadToken,
  isNetworkError: () => isNetworkError
});
function blogUrl({ owner, repo } = {}) {
  const o = String(owner || "").trim().toLowerCase();
  const r = String(repo || "").trim();
  if (!o || !r) return "";
  return `https://${o}.github.io/${encodeURIComponent(r)}/`;
}
function isNetworkError(err) {
  if (!err) return false;
  if (Number(err.status)) return false;
  const name = String(err.name || "");
  const msg = String(err.message || "").toLowerCase();
  return name === "TypeError" || /failed to fetch|networkerror|load failed|network request failed/.test(msg);
}
function isDeadToken(err) {
  if (!err) return false;
  if (isNetworkError(err)) return false;
  const status = Number(err.status) || 0;
  const msg = String(err.message || "").toLowerCase();
  if (/rate limit|abuse detection|secondary rate/.test(msg)) return false;
  if (status === 401) return true;
  if (/bad credentials|requires authentication|token expired|token has expired|token.*revoked/.test(msg)) return true;
  return false;
}

// src/core/thread.js
var thread_exports = {};
__export(thread_exports, {
  MAX_TURN_TEXT_CHARS: () => MAX_TURN_TEXT_CHARS,
  acceptTurn: () => acceptTurn,
  addScratch: () => addScratch,
  appendTurn: () => appendTurn,
  buildAskPrompt: () => buildAskPrompt,
  createThread: () => createThread,
  dismissTurn: () => dismissTurn,
  parseThread: () => parseThread,
  parseTitleOptions: () => parseTitleOptions,
  removeScratch: () => removeScratch,
  serializeThread: () => serializeThread,
  summarizeReactions: () => summarizeReactions,
  turnsFor: () => turnsFor
});
var ROLES = /* @__PURE__ */ new Set(["aside", "assistant"]);
var KINDS = /* @__PURE__ */ new Set(["guidance", "insertable"]);
var STATES = /* @__PURE__ */ new Set(["open", "accepted", "dismissed"]);
var _c = 0;
var MAX_TURN_TEXT_CHARS = 256 * 1024;
function createThread() {
  return { v: 1, mode: "doc", turns: [], scratch: [] };
}
var validRoleKind = (role, kind) => ROLES.has(role) && KINDS.has(kind) && !(role === "aside" && kind === "insertable");
function appendTurn(thread, { role, kind, text: text2, blockRef = null }, now) {
  if (!validRoleKind(role, kind)) return null;
  const turn = {
    id: "t" + Number(now).toString(36) + "-" + _c++,
    role,
    kind,
    text: String(text2 || "").slice(0, MAX_TURN_TEXT_CHARS),
    blockRef,
    ts: now,
    state: "open"
  };
  thread.turns.push(turn);
  return turn;
}
var find = (thread, id) => thread.turns.find((t) => t.id === id) || null;
function acceptTurn(thread, id) {
  const t = find(thread, id);
  if (!t || t.kind !== "insertable") return null;
  t.state = "accepted";
  return t;
}
function dismissTurn(thread, id) {
  const t = find(thread, id);
  if (!t) return null;
  t.state = "dismissed";
  return t;
}
function turnsFor(thread, blockRef) {
  return thread.turns.filter((t) => t.blockRef === blockRef && t.state !== "dismissed");
}
function addScratch(thread, text2, now) {
  const t = String(text2 == null ? "" : text2).trim();
  if (!t) return null;
  const jot = { id: "s" + Number(now).toString(36) + "-" + _c++, text: t, ts: now };
  if (!Array.isArray(thread.scratch)) thread.scratch = [];
  thread.scratch.unshift(jot);
  return jot;
}
function removeScratch(thread, id) {
  if (!Array.isArray(thread.scratch)) return null;
  const i = thread.scratch.findIndex((s) => s && s.id === id);
  if (i < 0) return null;
  return thread.scratch.splice(i, 1)[0];
}
function serializeThread(thread) {
  return JSON.stringify(thread);
}
var validTurn = (t) => t && typeof t === "object" && typeof t.id === "string" && validRoleKind(t.role, t.kind) && typeof t.text === "string" && t.text.length <= MAX_TURN_TEXT_CHARS && // size cap — see MAX_TURN_TEXT_CHARS
(t.blockRef === null || typeof t.blockRef === "string") && typeof t.ts === "number" && STATES.has(t.state);
var validJot = (s) => s && typeof s === "object" && typeof s.id === "string" && typeof s.text === "string" && typeof s.ts === "number";
function parseThread(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return createThread();
  }
  if (!raw || typeof raw !== "object" || raw.v !== 1) return createThread();
  return {
    v: 1,
    mode: raw.mode === "chat" ? "chat" : "doc",
    // saved modes honoured exactly; anything else falls to the Doc default
    turns: Array.isArray(raw.turns) ? raw.turns.filter(validTurn) : [],
    scratch: Array.isArray(raw.scratch) ? raw.scratch.filter(validJot) : []
  };
}
var INSERTABLE_ASKS = /* @__PURE__ */ new Set(["tighten", "continue", "title"]);
var blockText = (b) => !b ? "" : (b.text || b.caption || b.alt || "").slice(0, 2e3);
var FIELD_NOTES = {
  heading: " The author is working on a heading: offer one variation or a sharpening suggestion they can take or leave, and touch nothing else.",
  text: " The author is in a body paragraph: respond with encouragement, a conversational reaction, or one small suggestion. Never rewrite their text; rewriting only happens when they explicitly ask to tighten or continue."
};
var TITLE_FORMAT = "Reply with exactly three options, one per line - no numbering, no bullets, no quotes, nothing else.";
function buildAskPrompt({ ask, text: text2 = "", field: field2 = null, block = null, title = "", prevBlock = null, nextBlock = null, profile = null, recentReactions = null }) {
  const wantsInsertable = INSERTABLE_ASKS.has(ask);
  const voice = profile && profile.voice ? `
Author voice notes: ${String(profile.voice).slice(0, 500)}` : "";
  const steer = recentReactions ? `
The author reacted to some of your earlier guidance - lean toward what the author liked and away from what they disliked:
${String(recentReactions).slice(0, 1200)}` : "";
  const system = wantsInsertable ? `You help an author write a blog post. Reply ONLY with the requested text, ready to drop into the post. No preamble, no quotes around it.${voice}${steer}` : `You are a writing guide inside the author's composer. Respond with a short question, nudge, or piece of feedback that moves their thinking forward.${FIELD_NOTES[field2] || ""} Do not write or draft post text for them; guide, do not ghostwrite.${voice}${steer}`;
  const ctx = [];
  if (title) ctx.push(`Post title: ${title}`);
  if (prevBlock) ctx.push(`Previous block: ${blockText(prevBlock)}`);
  if (block) ctx.push(`Focus block (${block.type}): ${blockText(block)}`);
  if (nextBlock) ctx.push(`Next block: ${blockText(nextBlock)}`);
  const asks = {
    aside: `The author says: ${text2}`,
    reply: `The author asks about the focus block: ${text2 || "(no message - give your reaction to the block)"}`,
    tighten: "Tighten the focus block: same meaning, fewer words, keep the author voice.",
    continue: "Continue the post from the focus block with one natural next paragraph.",
    // Title workshop: a post that already has a title gets THREE short variations of
    // it - offers the author can take or leave, never an imposition; a titleless post
    // gets three fresh candidates. One AI call either way; the chips re-parse the lines.
    title: title ? `Offer THREE short variations of the current title - alternatives the author can take or leave. ${TITLE_FORMAT}` : `Suggest three strong titles for this post - offers the author can take or leave. ${TITLE_FORMAT}`
  };
  return { system, user: ctx.concat([asks[ask] || asks.aside]).join("\n\n"), wantsInsertable };
}
function parseTitleOptions(text2) {
  const out = [], seen = /* @__PURE__ */ new Set();
  for (const line of String(text2 == null ? "" : text2).split(/\r?\n/)) {
    const t = line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "").replace(/^["'“‘]+|["'”’]+$/g, "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === 3) break;
  }
  return out;
}
function summarizeReactions(turns) {
  const reacted = (Array.isArray(turns) ? turns : []).filter((t) => t && t.role === "assistant" && t.kind === "guidance" && !t.error && (t.reaction === "up" || t.reaction === "down"));
  if (!reacted.length) return null;
  return reacted.slice(-10).map((t) => {
    const s = String(t.text || "").replace(/\s+/g, " ").trim();
    return `The author ${t.reaction === "up" ? "liked" : "disliked"}: "${s.slice(0, 80)}${s.length > 80 ? "\u2026" : ""}"`;
  }).join("\n");
}

// src/core/themeCatalogue.js
var themeCatalogue_exports = {};
__export(themeCatalogue_exports, {
  BAKED_CATALOGUE: () => BAKED_CATALOGUE,
  CATALOGUE_URL: () => CATALOGUE_URL,
  DEFAULT_THEME: () => DEFAULT_THEME,
  PICKER_CSS: () => PICKER_CSS,
  PICKER_STYLE_ID: () => PICKER_STYLE_ID,
  fetchLiveCatalogue: () => fetchLiveCatalogue,
  groupByCategory: () => groupByCategory,
  mountThemePicker: () => mountThemePicker,
  parseCatalogue: () => parseCatalogue,
  pickerBodyHTML: () => pickerBodyHTML,
  safeColor: () => safeColor,
  themeCardHTML: () => themeCardHTML
});
var BAKED_CATALOGUE = {
  "$schema-note": "Blog theme registry. `id` matches src/styles/themes/<id>.css and the data-blog-theme value on <html>. `hero` names the homepage ARCHETYPE \u2014 index.astro renders src/components/home/Home<Archetype>.astro so every theme has a STRUCTURALLY distinct first screen (a front page, a start screen, a pinboard\u2026), not just a recolour. The rings/torus WebGL hero (archetype `rings`) is reserved for `observatory`. `vocabulary` gives each theme its own words: postsTitle (the writing archive's name), topicsLabel (the noun for the topic set, replacing 'constellations'), aboutLabel, an optional demo tagline, and topicNames \u2014 a DISPLAY-NAME override map over the seed topic SLUGS in src/data/topics.json (slugs/URLs never change; unknown/user topics pass through). Chrome labels fall back to observatory's defaults when a key is absent. The Chapbook composer reads this list for its theme picker; preview{bg,ink,accent} are swatches only.",
  "categories": [
    {
      "id": "professional",
      "name": "Personal & business"
    },
    {
      "id": "clean",
      "name": "Clean & Simple"
    },
    {
      "id": "editorial",
      "name": "Editorial"
    },
    {
      "id": "creative",
      "name": "Creative & Fun"
    },
    {
      "id": "kids",
      "name": "First Blogs (ages 10\u201315)"
    },
    {
      "id": "photo",
      "name": "Photo & Portfolio"
    }
  ],
  "themes": [
    {
      "id": "folio",
      "name": "Folio",
      "category": "professional",
      "hero": "folio",
      "description": "A personal practice with an editorial introduction, a compact background column, services and a writing index.",
      "preview": {
        "bg": "#f8f6f0",
        "ink": "#202a30",
        "accent": "#315b71"
      },
      "vocabulary": {
        "postsTitle": "Writing",
        "topicsLabel": "Topics",
        "aboutLabel": "About",
        "topicNames": {}
      }
    },
    {
      "id": "practice",
      "name": "Practice",
      "category": "professional",
      "hero": "practice",
      "description": "A calm consulting-room layout with areas of practice, clear credentials, contact details and an optional appointment link.",
      "preview": {
        "bg": "#f3f4ec",
        "ink": "#203b35",
        "accent": "#315b47"
      },
      "vocabulary": {
        "postsTitle": "Writing",
        "topicsLabel": "Topics",
        "aboutLabel": "About",
        "topicNames": {}
      }
    },
    {
      "id": "petal",
      "name": "Petal",
      "category": "professional",
      "hero": "petal",
      "description": "An intimate beauty studio: a framed introduction, a treatment menu and a quiet appointment invitation.",
      "preview": {
        "bg": "#f8eeea",
        "ink": "#412c35",
        "accent": "#86475f"
      },
      "vocabulary": {
        "postsTitle": "Journal",
        "topicsLabel": "Topics",
        "aboutLabel": "About",
        "topicNames": {}
      }
    },
    {
      "id": "contour",
      "name": "Contour",
      "category": "professional",
      "hero": "contour",
      "description": "A precise aesthetics practice with a consultation panel, numbered treatments and clear practitioner information.",
      "preview": {
        "bg": "#f4f3f0",
        "ink": "#222c32",
        "accent": "#335c68"
      },
      "vocabulary": {
        "postsTitle": "Journal",
        "topicsLabel": "Topics",
        "aboutLabel": "About",
        "topicNames": {}
      }
    },
    {
      "id": "cut",
      "name": "Cut",
      "category": "professional",
      "hero": "cut",
      "description": "A bold salon front page with a typographic masthead, compact price list and an appointment rail.",
      "preview": {
        "bg": "#f5f1e7",
        "ink": "#251f20",
        "accent": "#842c31"
      },
      "vocabulary": {
        "postsTitle": "Journal",
        "topicsLabel": "Topics",
        "aboutLabel": "About",
        "topicNames": {}
      }
    },
    {
      "id": "still",
      "name": "Still",
      "category": "professional",
      "hero": "still",
      "description": "A spacious wellness practice with a centred opening, session cards and a quiet reading list.",
      "preview": {
        "bg": "#eeefe7",
        "ink": "#303d32",
        "accent": "#4d6552"
      },
      "vocabulary": {
        "postsTitle": "Journal",
        "topicsLabel": "Topics",
        "aboutLabel": "About",
        "topicNames": {}
      }
    },
    {
      "id": "office",
      "name": "Office",
      "category": "professional",
      "hero": "office",
      "description": "A consulting desk with a two-column introduction, structured service index and recent writing.",
      "preview": {
        "bg": "#eef2f5",
        "ink": "#202d40",
        "accent": "#315b89"
      },
      "vocabulary": {
        "postsTitle": "Journal",
        "topicsLabel": "Topics",
        "aboutLabel": "About",
        "topicNames": {}
      }
    },
    {
      "id": "portrait",
      "name": "Portrait",
      "category": "professional",
      "hero": "portrait",
      "description": "A personal calling card with a large nameplate, short biography, selected work and a compact journal.",
      "preview": {
        "bg": "#f9f5ed",
        "ink": "#342c29",
        "accent": "#775747"
      },
      "vocabulary": {
        "postsTitle": "Journal",
        "topicsLabel": "Topics",
        "aboutLabel": "About",
        "topicNames": {}
      }
    },
    {
      "id": "observatory",
      "name": "Observatory",
      "category": "clean",
      "hero": "rings",
      "description": "The house style: near-black canvas, teal-to-violet accents and a fine grotesque. Calm, technical, and the default.",
      "preview": {
        "bg": "#04060c",
        "ink": "#f4f7fd",
        "accent": "#22d3ee"
      },
      "vocabulary": {
        "postsTitle": "Posts",
        "topicsLabel": "Constellations",
        "aboutLabel": "About",
        "tagline": "Explainers from the workshop, the pantry and the sky.",
        "topicNames": {}
      }
    },
    {
      "id": "ledger",
      "name": "Ledger",
      "category": "clean",
      "hero": "index",
      "description": "Ruled off-white paper with a disciplined grotesque and hairline rules. Reads like a well-kept notebook.",
      "preview": {
        "bg": "#f6f5f0",
        "ink": "#1a1b1d",
        "accent": "#0f766e"
      },
      "vocabulary": {
        "postsTitle": "Entries",
        "topicsLabel": "Ledgers",
        "aboutLabel": "Flyleaf",
        "tagline": "A well-kept notebook, in public.",
        "topicNames": {
          "marrow": "Days",
          "forge": "Work",
          "old-bones": "Kitchen",
          "marginalia": "Reading",
          "after-hours": "Culture",
          "atlas": "Journeys",
          "nebula": "Notes"
        }
      }
    },
    {
      "id": "air",
      "name": "Air",
      "category": "clean",
      "hero": "solo",
      "description": "Maximum whitespace, a single soft-blue accent and quiet type. Nothing on the page you didn't ask for.",
      "preview": {
        "bg": "#fbfbfd",
        "ink": "#1a1c22",
        "accent": "#2f6bff"
      },
      "vocabulary": {
        "postsTitle": "Writing",
        "topicsLabel": "Topics",
        "aboutLabel": "About",
        "tagline": "Less, but better.",
        "topicNames": {
          "marrow": "Life",
          "forge": "Work",
          "old-bones": "Food",
          "marginalia": "Books",
          "after-hours": "Culture",
          "atlas": "Travel",
          "nebula": "Ideas"
        }
      }
    },
    {
      "id": "blueprint-workshop",
      "name": "Blueprint Workshop",
      "category": "clean",
      "hero": "blueprint-board",
      "description": "A working drafting table: gridded plans, numbered project sheets, specifications and cool cyan linework.",
      "preview": {
        "bg": "#06172c",
        "ink": "#eef7ff",
        "accent": "#9bdcff"
      },
      "vocabulary": {
        "postsTitle": "Drawing Register",
        "topicsLabel": "Specifications",
        "aboutLabel": "The Workshop",
        "tagline": "Ideas drawn, tested and issued.",
        "topicNames": {
          "marrow": "Human Factors",
          "forge": "Builds",
          "old-bones": "Materials",
          "marginalia": "References",
          "after-hours": "Experiments",
          "atlas": "Field Work",
          "nebula": "Concepts"
        }
      }
    },
    {
      "id": "broadsheet",
      "name": "Broadsheet",
      "category": "editorial",
      "hero": "frontpage",
      "description": "A proper newspaper: a towering serif masthead, multi-column index with column rules and a drop-cap lede.",
      "preview": {
        "bg": "#f5f2ea",
        "ink": "#1a1714",
        "accent": "#8a1f14"
      },
      "vocabulary": {
        "postsTitle": "Front Page",
        "topicsLabel": "The Desks",
        "aboutLabel": "The Masthead",
        "tagline": "All the news that fits \u2014 and some that doesn't.",
        "topicNames": {
          "marrow": "Living",
          "forge": "Technology",
          "old-bones": "Food & Drink",
          "marginalia": "Books",
          "after-hours": "Arts",
          "atlas": "Travel",
          "nebula": "Opinion"
        }
      }
    },
    {
      "id": "journal",
      "name": "Journal",
      "category": "editorial",
      "hero": "essay-cover",
      "description": "Stark black-on-cream, an oversized display serif and italic datelines. An unhurried literary quarterly.",
      "preview": {
        "bg": "#f6efe1",
        "ink": "#2a2118",
        "accent": "#7c4a1e"
      },
      "vocabulary": {
        "postsTitle": "The Journal",
        "topicsLabel": "Departments",
        "aboutLabel": "Colophon",
        "tagline": "Essays, unhurried.",
        "topicNames": {
          "marrow": "Living",
          "forge": "Craft",
          "old-bones": "The Table",
          "marginalia": "Marginalia",
          "after-hours": "Arts & Letters",
          "atlas": "Correspondence",
          "nebula": "Essays"
        }
      }
    },
    {
      "id": "kiosk",
      "name": "Kiosk",
      "category": "editorial",
      "hero": "news-wall",
      "description": "A working newsstand: one lead story, smaller illustrated headlines, article summaries and instant search.",
      "preview": {
        "bg": "#faf7f0",
        "ink": "#111111",
        "accent": "#e11d2a"
      },
      "vocabulary": {
        "postsTitle": "Headlines",
        "topicsLabel": "Sections",
        "aboutLabel": "Masthead",
        "tagline": "Straight off the newsstand.",
        "topicNames": {
          "marrow": "Life",
          "forge": "Tech",
          "old-bones": "Food",
          "marginalia": "Books",
          "after-hours": "Culture",
          "atlas": "Travel",
          "nebula": "Features"
        }
      }
    },
    {
      "id": "desert-archive",
      "name": "Desert Archive",
      "category": "editorial",
      "hero": "desert-scroll",
      "description": "A panoramic field journal with a sunlit horizon, horizontal folios and route-based story navigation.",
      "preview": {
        "bg": "#d9ae76",
        "ink": "#301b12",
        "accent": "#a94f35"
      },
      "vocabulary": {
        "postsTitle": "Field Notes",
        "topicsLabel": "Routes",
        "aboutLabel": "The Expedition",
        "tagline": "Stories carried across open ground.",
        "topicNames": {
          "marrow": "Shelter",
          "forge": "Craft",
          "old-bones": "Provisions",
          "marginalia": "Fragments",
          "after-hours": "Night Camp",
          "atlas": "Routes",
          "nebula": "Horizons"
        }
      }
    },
    {
      "id": "neon",
      "name": "Neon",
      "category": "creative",
      "hero": "marquee",
      "description": "After-dark and electric \u2014 inky violet-black, glowing cyan and magenta, and type that hums.",
      "preview": {
        "bg": "#0a0812",
        "ink": "#f3ecff",
        "accent": "#22f5ff"
      },
      "vocabulary": {
        "postsTitle": "After Dark",
        "topicsLabel": "Frequencies",
        "aboutLabel": "Backstage",
        "tagline": "Broadcasting after hours.",
        "topicNames": {
          "marrow": "Nightlife",
          "forge": "Signals",
          "old-bones": "Late Eats",
          "marginalia": "B-Sides",
          "after-hours": "The Scene",
          "atlas": "Neon Cities",
          "nebula": "Static"
        }
      }
    },
    {
      "id": "zine",
      "name": "Zine",
      "category": "creative",
      "hero": "collage",
      "description": "Photocopied punk: high-contrast paper, one screaming spot colour, cut-and-paste rules and heavy caps.",
      "preview": {
        "bg": "#ece9e2",
        "ink": "#0d0d0d",
        "accent": "#ff2d55"
      },
      "vocabulary": {
        "postsTitle": "Back Pages",
        "topicsLabel": "Cut & Paste",
        "aboutLabel": "Who We Are",
        "tagline": "Photocopied and proud.",
        "topicNames": {
          "marrow": "Real Talk",
          "forge": "DIY",
          "old-bones": "Cheap Eats",
          "marginalia": "Zines",
          "after-hours": "Noise",
          "atlas": "On the Road",
          "nebula": "Rants"
        }
      }
    },
    {
      "id": "scrapbook",
      "name": "Scrapbook",
      "category": "creative",
      "hero": "pinboard",
      "description": "A warm pinboard of real photos, excerpts and topic annotations. Paper details without invented endorsements.",
      "preview": {
        "bg": "#f3ead8",
        "ink": "#3a2f26",
        "accent": "#d1495b"
      },
      "vocabulary": {
        "postsTitle": "Keepsakes",
        "topicsLabel": "Collections",
        "aboutLabel": "About Me",
        "tagline": "Everything worth sticking in.",
        "topicNames": {
          "marrow": "Everyday",
          "forge": "Made",
          "old-bones": "Recipes",
          "marginalia": "Bookmarks",
          "after-hours": "Odds & Ends",
          "atlas": "Snapshots",
          "nebula": "Daydreams"
        }
      }
    },
    {
      "id": "woodland-chronicle",
      "name": "Woodland Chronicle",
      "category": "creative",
      "hero": "woodland-trail",
      "description": "An organic story trail with a layered canopy, featured clearing, branching chronology and botanical details.",
      "preview": {
        "bg": "#d9ddc5",
        "ink": "#202719",
        "accent": "#3f7048"
      },
      "vocabulary": {
        "postsTitle": "Chronicles",
        "topicsLabel": "Groves",
        "aboutLabel": "The Keeper",
        "tagline": "Stories gathered along the path.",
        "topicNames": {
          "marrow": "Roots",
          "forge": "Handwork",
          "old-bones": "Forage",
          "marginalia": "Leaves",
          "after-hours": "Dusk",
          "atlas": "Trails",
          "nebula": "Canopy"
        }
      }
    },
    {
      "id": "doodle",
      "name": "Doodle",
      "category": "kids",
      "hero": "notebook",
      "description": "Your notebook, but online: squared paper, biro-blue ink, highlighter swipes and hand-drawn arrows. Annotate everything.",
      "preview": {
        "bg": "#fbfcf7",
        "ink": "#20252b",
        "accent": "#2f5fd0"
      },
      "vocabulary": {
        "postsTitle": "Rough Work",
        "topicsLabel": "Subjects",
        "aboutLabel": "About Me",
        "tagline": "Your notebook, but online.",
        "topicNames": {
          "marrow": "Life Stuff",
          "forge": "Tech Class",
          "old-bones": "Snack Break",
          "marginalia": "Book Reports",
          "after-hours": "Art Class",
          "atlas": "Field Trips",
          "nebula": "Margins"
        }
      }
    },
    {
      "id": "rocket",
      "name": "Rocket",
      "category": "kids",
      "hero": "mission-control",
      "description": "Mission-control console: telemetry rules, stencilled mission numbers and countdown date badges. All systems go.",
      "preview": {
        "bg": "#0e1330",
        "ink": "#eef3ff",
        "accent": "#4dd6ff"
      },
      "vocabulary": {
        "postsTitle": "Mission Log",
        "topicsLabel": "Systems",
        "aboutLabel": "Ground Control",
        "tagline": "All systems go.",
        "topicNames": {
          "marrow": "Life Support",
          "forge": "Engineering",
          "old-bones": "Rations",
          "marginalia": "Archives",
          "after-hours": "Comms",
          "atlas": "Navigation",
          "nebula": "Telemetry"
        }
      }
    },
    {
      "id": "pixel",
      "name": "Pixel",
      "category": "kids",
      "hero": "pixel-quest",
      "description": "Cosy retro-handheld: a chunky pixel wordmark, soft daylight palette, sprite accents and an XP-bar reading strip.",
      "preview": {
        "bg": "#e8f4d6",
        "ink": "#2b2f24",
        "accent": "#5a9e3f"
      },
      "vocabulary": {
        "postsTitle": "Quests",
        "topicsLabel": "Zones",
        "aboutLabel": "Player Info",
        "tagline": "Press start on your first blog.",
        "topicNames": {
          "marrow": "Home Base",
          "forge": "Workshop",
          "old-bones": "The Inn",
          "marginalia": "Library",
          "after-hours": "Arcade",
          "atlas": "Overworld",
          "nebula": "Side Quests"
        }
      }
    },
    {
      "id": "comic",
      "name": "Comic",
      "category": "kids",
      "hero": "manga",
      "description": "Manga energy: screen-tone halftones, a dynamic panel grid and speech-bubble headlines. Every post a splash page.",
      "preview": {
        "bg": "#fff8e6",
        "ink": "#14110c",
        "accent": "#ff3b3b"
      },
      "vocabulary": {
        "postsTitle": "Issues",
        "topicsLabel": "Story Arcs",
        "aboutLabel": "Origin Story",
        "tagline": "Every post a splash page.",
        "topicNames": {
          "marrow": "Slice of Life",
          "forge": "Gadgets",
          "old-bones": "Cooking Arc",
          "marginalia": "Backstory",
          "after-hours": "Culture",
          "atlas": "On Location",
          "nebula": "Panels"
        }
      }
    },
    {
      "id": "field-atlas",
      "name": "Field Atlas",
      "category": "photo",
      "hero": "field-atlas",
      "description": "A cartographer's table with topographic contours, coordinate-led records and a colour-keyed field legend.",
      "preview": {
        "bg": "#d9d4bd",
        "ink": "#20251f",
        "accent": "#2f6f67"
      },
      "vocabulary": {
        "postsTitle": "Field Records",
        "topicsLabel": "Map Legend",
        "aboutLabel": "The Surveyor",
        "tagline": "Every story has a coordinate.",
        "topicNames": {
          "marrow": "Habitat",
          "forge": "Equipment",
          "old-bones": "Specimens",
          "marginalia": "Annotations",
          "after-hours": "Night Survey",
          "atlas": "Coordinates",
          "nebula": "Unmapped"
        }
      }
    },
    {
      "id": "darkroom",
      "name": "Darkroom",
      "category": "photo",
      "hero": "lightbox",
      "description": "A photography exhibition: real uploaded photographs on a quiet lightbox, followed by a compact index of text-only notes.",
      "preview": {
        "bg": "#0b0b0d",
        "ink": "#ededf0",
        "accent": "#d4d4d8"
      },
      "vocabulary": {
        "postsTitle": "Exposures",
        "topicsLabel": "Contact Sheets",
        "aboutLabel": "About",
        "tagline": "Developed in the dark.",
        "topicNames": {
          "marrow": "Daily",
          "forge": "Technical",
          "old-bones": "Still Life",
          "marginalia": "Notes",
          "after-hours": "Night",
          "atlas": "On Location",
          "nebula": "Prints"
        }
      }
    },
    {
      "id": "contact-sheet",
      "name": "Contact Sheet",
      "category": "photo",
      "hero": "contact-sheet",
      "description": "A dense photographic proof sheet with real post images, frame numbers and a separate caption log. Text-only entries use numbered plates.",
      "preview": {
        "bg": "#161514",
        "ink": "#eae8e3",
        "accent": "#f4a11f"
      },
      "vocabulary": {
        "postsTitle": "Rolls",
        "topicsLabel": "Frames",
        "aboutLabel": "Colophon",
        "tagline": "Proof, frame by frame.",
        "topicNames": {
          "marrow": "Everyday",
          "forge": "Gear",
          "old-bones": "Food",
          "marginalia": "Notes",
          "after-hours": "Night",
          "atlas": "Location",
          "nebula": "Proofs"
        }
      }
    },
    {
      "id": "polaroid",
      "name": "Postcards",
      "category": "photo",
      "hero": "photo-pile",
      "description": "An illustrated correspondence: alternating photograph-and-letter spreads, postmarked dates and a readable archive. Replaces the old scattered photo pile.",
      "preview": {
        "bg": "#e9e6df",
        "ink": "#26241f",
        "accent": "#3a7ca5"
      },
      "vocabulary": {
        "postsTitle": "Postcards",
        "topicsLabel": "Places & subjects",
        "aboutLabel": "About",
        "tagline": "Notes from here and there.",
        "topicNames": {
          "marrow": "Moments",
          "forge": "Tinkering",
          "old-bones": "Meals",
          "marginalia": "Reads",
          "after-hours": "Fun",
          "atlas": "Trips",
          "nebula": "Captions"
        }
      }
    }
  ]
};
var DEFAULT_THEME = "observatory";
var CATALOGUE_URL = "https://api.github.com/repos/RQAI-projects/chapbook-template/contents/src/data/themes.json";
var esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function safeColor(v) {
  return typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : "transparent";
}
function decodeBase64Utf8(b64) {
  const clean = String(b64).replace(/\s+/g, "");
  const bin = atob(clean);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function isValidTheme(t) {
  return !!t && typeof t.id === "string" && t.id && typeof t.name === "string" && t.name && t.preview && typeof t.preview === "object";
}
function normaliseCatalogue(obj) {
  if (!obj || typeof obj !== "object") throw new Error("themeCatalogue: payload is not an object");
  const themes = Array.isArray(obj.themes) ? obj.themes.filter(isValidTheme) : [];
  if (!themes.length) throw new Error("themeCatalogue: no valid themes in payload");
  const categories = Array.isArray(obj.categories) ? obj.categories.filter((c) => c && typeof c.id === "string" && c.id && typeof c.name === "string" && c.name) : [];
  return { categories, themes };
}
function parseCatalogue(payload) {
  let obj = payload;
  if (payload && typeof payload === "object" && typeof payload.content === "string" && !Array.isArray(payload.themes)) {
    const text2 = payload.encoding === "base64" || payload.encoding == null ? decodeBase64Utf8(payload.content) : payload.content;
    obj = JSON.parse(text2);
  } else if (typeof payload === "string") {
    obj = JSON.parse(payload);
  }
  return normaliseCatalogue(obj);
}
async function fetchLiveCatalogue(fetchImpl) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (typeof f !== "function") return BAKED_CATALOGUE;
  try {
    const res = await f(CATALOGUE_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res || !res.ok) return BAKED_CATALOGUE;
    const body = await res.json();
    return parseCatalogue(body);
  } catch {
    return BAKED_CATALOGUE;
  }
}
function groupByCategory(catalogue) {
  const cat = catalogue && Array.isArray(catalogue.themes) ? catalogue : BAKED_CATALOGUE;
  const order = Array.isArray(cat.categories) ? cat.categories : [];
  const byId = new Map(order.map((c) => [c.id, { id: c.id, name: c.name, themes: [] }]));
  const extra = { id: "_more", name: "More", themes: [] };
  for (const t of cat.themes) {
    const g = byId.get(t.category) || extra;
    g.themes.push(t);
  }
  const groups = order.map((c) => byId.get(c.id)).filter((g) => g && g.themes.length);
  if (extra.themes.length) groups.push(extra);
  return groups;
}
var PICKER_STYLE_ID = "cbtp-style";
var PICKER_CSS = `
.cbtp{display:flex;flex-direction:column;gap:.85rem}
.cbtp-cat-h{margin:0 0 .45rem;font:600 .66rem var(--cbtp-font,'Space Grotesk',system-ui,sans-serif);
  letter-spacing:.1em;text-transform:uppercase;color:var(--cbtp-faint,#6f7e98)}
.cbtp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.5rem}
.cbtp-card{display:flex;align-items:flex-start;gap:.6rem;width:100%;text-align:left;margin:0;
  border:1px solid var(--cbtp-line,rgba(140,160,200,.16));border-radius:12px;padding:.55rem .6rem;
  background:var(--cbtp-surface,#0b1120);color:var(--cbtp-ink,#f4f7fd);cursor:pointer;font:inherit;
  transition:border-color .12s,box-shadow .12s,background .12s}
.cbtp-card:hover{border-color:var(--cbtp-acc,#22d3ee)}
.cbtp-card:focus-visible{outline:none;border-color:var(--cbtp-acc,#22d3ee);
  box-shadow:0 0 0 3px rgba(34,211,238,.28)}
.cbtp-card.sel{border-color:var(--cbtp-acc,#22d3ee);
  box-shadow:0 0 0 1px var(--cbtp-acc,#22d3ee),0 8px 24px -14px var(--cbtp-acc,#22d3ee)}
.cbtp-sw{position:relative;flex:0 0 auto;width:44px;height:36px;border-radius:8px;overflow:hidden;
  border:1px solid rgba(140,160,200,.22)}
.cbtp-sw .cbtp-bar{position:absolute;left:7px;right:7px;bottom:8px;height:4px;border-radius:2px;opacity:.92}
.cbtp-sw .cbtp-dot{position:absolute;top:7px;left:7px;width:12px;height:12px;border-radius:50%}
.cbtp-tx{min-width:0}
.cbtp-nm{display:block;margin-bottom:.12em;font:650 .84rem var(--cbtp-font,'Space Grotesk',system-ui,sans-serif)}
.cbtp-card.sel .cbtp-nm{color:var(--cbtp-acc,#22d3ee)}
.cbtp-ds{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  font-size:.73rem;line-height:1.35;color:var(--cbtp-mut,#aebbd2)}`;
function themeCardHTML(theme, checked) {
  const p = theme.preview || {};
  const on = !!checked;
  return `<button type="button" class="cbtp-card${on ? " sel" : ""}" role="radio" aria-checked="${on ? "true" : "false"}" tabindex="${on ? "0" : "-1"}" data-theme="${esc(theme.id)}"><span class="cbtp-sw" aria-hidden="true" style="background:${safeColor(p.bg)}"><span class="cbtp-dot" style="background:${safeColor(p.accent)}"></span><span class="cbtp-bar" style="background:${safeColor(p.ink)}"></span></span><span class="cbtp-tx"><span class="cbtp-nm">${esc(theme.name)}</span><span class="cbtp-ds">${esc(theme.description)}</span></span></button>`;
}
function pickerBodyHTML(catalogue, selectedId) {
  const groups = groupByCategory(catalogue);
  const themes = catalogue && catalogue.themes || BAKED_CATALOGUE.themes;
  const sel = themes.some((t) => t.id === selectedId) ? selectedId : themes.some((t) => t.id === DEFAULT_THEME) ? DEFAULT_THEME : themes[0] && themes[0].id;
  return '<p><a href="https://chapbook.rqai.co.uk/themes/" target="_blank" rel="noopener">Preview the full theme gallery \u2197</a></p>' + groups.map((g) => `<div class="cbtp-cat"><div class="cbtp-cat-h">${esc(g.name)}</div><div class="cbtp-grid">${g.themes.map((t) => themeCardHTML(t, t.id === sel)).join("")}</div></div>`).join("");
}
function ensurePickerStyles(doc) {
  if (!doc || doc.getElementById(PICKER_STYLE_ID)) return;
  const st = doc.createElement("style");
  st.id = PICKER_STYLE_ID;
  st.textContent = PICKER_CSS;
  (doc.head || doc.documentElement).appendChild(st);
}
function mountThemePicker(container, opts = {}) {
  if (!container || typeof document === "undefined") return null;
  const catalogue = opts.catalogue && Array.isArray(opts.catalogue.themes) && opts.catalogue.themes.length ? opts.catalogue : BAKED_CATALOGUE;
  const onSelect = typeof opts.onSelect === "function" ? opts.onSelect : null;
  const ids = catalogue.themes.map((t) => t.id);
  let current = ids.includes(opts.selected) ? opts.selected : ids.includes(DEFAULT_THEME) ? DEFAULT_THEME : ids[0];
  ensurePickerStyles(container.ownerDocument || document);
  container.classList.add("cbtp");
  container.setAttribute("role", "radiogroup");
  if (!container.getAttribute("aria-label")) container.setAttribute("aria-label", "Blog theme");
  container.innerHTML = pickerBodyHTML(catalogue, current);
  const cards = () => Array.from(container.querySelectorAll(".cbtp-card"));
  const select = (id, focus) => {
    if (!ids.includes(id)) return;
    current = id;
    for (const el of cards()) {
      const isOn = el.dataset.theme === id;
      el.classList.toggle("sel", isOn);
      el.setAttribute("aria-checked", isOn ? "true" : "false");
      el.tabIndex = isOn ? 0 : -1;
      if (isOn) {
        el.querySelector(".cbtp-nm")?.setAttribute("data-sel", "1");
        if (focus) el.focus();
      }
    }
    if (onSelect) onSelect(id);
  };
  container.addEventListener("click", (e) => {
    const card = e.target.closest(".cbtp-card[data-theme]");
    if (card && container.contains(card)) select(card.dataset.theme, false);
  });
  container.addEventListener("keydown", (e) => {
    const card = e.target.closest && e.target.closest(".cbtp-card[data-theme]");
    if (!card) return;
    const list = cards();
    const i = list.indexOf(card);
    if (i < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % list.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      select(card.dataset.theme, false);
      return;
    } else return;
    e.preventDefault();
    select(list[next].dataset.theme, true);
  });
  if (onSelect) onSelect(current);
  return { get value() {
    return current;
  }, set: (id) => select(id, false) };
}

// src/lib-entry.js
if (typeof window !== "undefined") window.__studioProfessional = professionalForm_exports;
window.__studioDomain ??= domain_exports;
window.__studioTour ??= tour_exports;
window.__studioQuotes ??= quotes_exports;
window.__studioCalendar ??= postCalendar_exports;
window.__studioShare ??= shareIntents_exports;
window.__studioPostList ??= postList_exports;
window.__studioConnection ??= connection_exports;
window.__studioThread ??= thread_exports;
window.__studioThemeCatalogue ??= themeCatalogue_exports;
window.__studioSanitise ??= stripUnsafeHtml;
