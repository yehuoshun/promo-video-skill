/**
 * 页面探针：在 HTML 载入后跑一遍，把「排版出问题的地方」写进 <div id="dsh-probe">。
 *
 * 由 probe.ps1 注入到页面末尾，不单独使用。只查四件事，都能一眼判断真假：
 *   1. 文字被裁——有文字的元素自己 overflow 不为 visible，且内容比容器大
 *   2. 图片变形——<img>/<video> 的渲染比例和原始比例不一致（= 被拉扁/拉长）
 *   3. 出画——元素超出 1920×1080 画布（出血、被切掉一半）
 *   4. 字体缺失——字体栈里的族名在本机不存在，会静默回退成默认字体
 */
(function () {
  function sel(el) {
    var parts = [];
    var node = el;
    for (var i = 0; i < 3 && node && node.nodeType === 1 && node !== document.body; i++) {
      var s = node.tagName.toLowerCase();
      if (node.id) {
        s += '#' + node.id;
        parts.unshift(s);
        break;
      }
      var cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function ownText(el) {
    var t = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) t += n.textContent;
    }
    return t.trim();
  }

  function hasTextSelfOrKids(el) {
    return ownText(el).length > 0;
  }

  function run() {
    var t0 = performance.now();
    // 画布尺寸以调用方请求的为准：--window-size 会被滚动条吃掉 16px，
    // 整帧容器（100vw/100vh）会因此被误判成"出画"。
    var cv = window.__DSH_CANVAS || { w: window.innerWidth, h: window.innerHeight };
    var vw = cv.w;
    var vh = cv.h;
    var res = { vw: vw, vh: vh, clip: [], stretch: [], bleed: [], fonts: [], ms: 0 };
    // 字体按"有文字的元素"收集，而不是只看 body：
    // 单行标语、价格签这类元素经常自己写 font-family，body 的字体栈里看不到。
    // 记整条字体栈，而不是单个族名。"PingFang SC", "Microsoft YaHei", sans-serif
    // 这种跨平台写法里掉一两个族名是正常的，只要栈里有一个命中就不算问题；
    // 真正该报警的是整条栈全部没有——那时浏览器用默认字体，你设计的字形全没了。
    var stackSet = {};
    function collectFonts(str) {
      var v = String(str || '').replace(/\s+/g, ' ').trim();
      if (v) stackSet[v] = true;
    }

    var nodes = document.querySelectorAll('body *');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.id === 'dsh-probe') continue;

      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;

      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;

      if (hasTextSelfOrKids(el)) collectFonts(cs.fontFamily);

      // 明显在画布外藏起来的装饰（left:-9999px 之类）不算问题
      var parked = r.right < -50 || r.bottom < -50 || r.left > vw + 500 || r.top > vh + 500;

      // 3. 出画
      // 纯装饰（渐变光斑、模糊光晕）本来就会故意出血，不报；
      // 带文字的元素出血才是 bug——那意味着字被切掉了。
      var decorative = !hasTextSelfOrKids(el) && (
        /gradient\(/.test(cs.backgroundImage) || /blur/.test(cs.filter)
      );
      if (!parked && !decorative) {
        var dx = Math.max(0, r.right - vw, -r.left);
        var dy = Math.max(0, r.bottom - vh, -r.top);
        if (dx > 2 || dy > 2) {
          res.bleed.push({ sel: sel(el), over: Math.round(Math.max(dx, dy)), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
        }
      }

      // 1. 文字被裁
      if (hasTextSelfOrKids(el) && cs.overflow !== 'visible') {
        var ow = el.scrollWidth - el.clientWidth;
        var oh = el.scrollHeight - el.clientHeight;
        if (ow > 1 || oh > 1) {
          res.clip.push({ sel: sel(el), text: ownText(el).slice(0, 24), over: Math.round(Math.max(ow, oh)), axis: ow >= oh ? '横向' : '纵向' });
        }
      }

      // 2. 图片变形（只查真实媒体元素，背景图无法拿到原始像素）
      var tag = el.tagName;
      if (tag === 'IMG' || tag === 'VIDEO') {
        var nw = tag === 'IMG' ? el.naturalWidth : el.videoWidth;
        var nh = tag === 'IMG' ? el.naturalHeight : el.videoHeight;
        if (nw > 0 && nh > 0) {
          var ratioSrc = nw / nh;
          var ratioDst = r.width / r.height;
          var drift = Math.abs(ratioDst - ratioSrc) / ratioSrc;
          if (drift > 0.02) {
            res.stretch.push({
              sel: sel(el),
              drawn: Math.round(r.width) + 'x' + Math.round(r.height),
              natural: nw + 'x' + nh,
              drift: Math.round(drift * 100),
            });
          }
        }
      }
    }

    // 4. 字体缺失：把字画进 canvas，比对像素。
    //    为什么不用宽度：中文全角，任何字体下宽度都一样；而且不同字体的
    //    拉丁宽度也可能恰好相同。实测本机 PinFang/Cascadia/Noto 三者宽度
    //    完全等于"不存在的字体"，只能量出一样的数字——改用像素比对，
    //    字形不同就是不同字体，精确到 1 个像素。
    try {
      collectFonts(getComputedStyle(document.body).fontFamily);
      var stacks = Object.keys(stackSet);
      var MISSING = '"dsh-definitely-missing-family-x9"';
      var TEXT = '宣传片 WMiI1@ Ag';

      function drawSig(family) {
        var cv = document.createElement('canvas');
        cv.width = 620;
        cv.height = 96;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#fff';
        ctx.font = '64px ' + family;
        ctx.textBaseline = 'middle';
        ctx.fillText(TEXT, 4, cv.height / 2);
        var data = ctx.getImageData(0, 0, cv.width, cv.height).data;
        var count = 0;
        var sum = 0;
        for (var k = 0; k < data.length; k += 4) {
          if (data[k] > 8) { count++; sum = (sum + k * data[k]) % 2147483647; }
        }
        return count + ':' + sum;
      }

      var baseSig = drawSig(MISSING);
      var avail = {};
      function available(name) {
        var k = name.toLowerCase();
        if (!(k in avail)) avail[k] = (drawSig('"' + name + '", ' + MISSING) !== baseSig);
        return avail[k];
      }
      var GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|-apple-system|ui-[a-z-]+|inherit|initial|unset|revert)$/i;
      for (var si = 0; si < stacks.length; si++) {
        var named = [];
        var parts = stacks[si].split(',');
        for (var pi = 0; pi < parts.length; pi++) {
          var nm = parts[pi].trim().replace(/^["']|["']$/g, '').trim();
          if (nm && !GENERIC.test(nm)) named.push(nm);
        }
        if (!named.length) continue;
        var hit = null;
        for (var qi = 0; qi < named.length; qi++) {
          if (available(named[qi])) { hit = named[qi]; break; }
        }
        if (!hit) res.fonts.push({ stack: stacks[si], missing: named });
      }
    } catch (e) { /* 字体探测失败不影响其它结论 */ }

    res.ms = Math.round(performance.now() - t0);

    var box = document.createElement('div');
    box.id = 'dsh-probe';
    box.style.cssText = 'position:absolute;left:-99999px;top:0;width:1px;height:1px';
    // base64 走一遍：页面里的引号/中文/尖括号都不会破坏 HTML 属性
    box.setAttribute('data-b64', btoa(unescape(encodeURIComponent(JSON.stringify(res)))));
    box.textContent = 'probe-done';
    document.body.appendChild(box);
  }

  if (document.readyState === 'complete') setTimeout(run, 0);
  else window.addEventListener('load', function () { setTimeout(run, 0); });
})();
