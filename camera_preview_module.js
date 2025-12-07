(function(){
  // Module Camera Preview & 4K Export / Recording
  // Usage: include this script after three.js and after the main app code.
  // It listens to the top bar "Camera" button click and attaches preview/export to the next camera added to scene,
  // skipping any camera that is already used by a projector (window.projectors).

  const PREVIEW_CSS_W = 280;
  const PREVIEW_CSS_MAX_H = 200;
  const EXPORT_WIDTH = 3840; // 4K width
  const EXPORT_HEIGHT = 2160; // 4K height
  const dpr = 1; // for export we use pixelRatio 1 to match dimensions exactly

  // small helper
  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if (k === 'style') e.style.cssText = v;
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c=>{
      if (!c) return;
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  function findCameraButton(){
    // try to find button in top menu that has text "Camera"
    const top = document.getElementById('top-menu') || document.querySelector('header') || document.body;
    const candidates = Array.from(top.querySelectorAll('button, .menu-item, .dropdown-item, a'));
    for (const c of candidates){
      const txt = (c.textContent || '').trim().toLowerCase();
      if (txt === 'camera' || txt === 'caméra' || txt === 'camera') return c;
    }
    // fallback: any element with data-action="camera"
    return document.querySelector('[data-action="camera"], [data-role="camera"]');
  }

  // detect if a camera is used by a projector
  function isProjectorCamera(camera){
    try {
      if (!window.projectors || !Array.isArray(window.projectors)) return false;
      return window.projectors.some(p => p && (p.camera === camera || p._camera === camera));
    } catch(e){ return false; }
  }

  // Create floating window UI and attach preview + export
  function attachPreviewToCamera(camera, label){
    if (!window.THREE || !camera || !window.scene) return;
    if (isProjectorCamera(camera)) {
      console.log('[camera_preview_module] Skipping projector camera');
      return;
    }
    if (camera.__previewAttached) return;
    camera.__previewAttached = true;

    const idx = Math.floor(Math.random()*10000);
    const title = label || (camera.name || ('Camera_' + idx));

    // Floating window
    const fw = el('div', { class: 'floating-window visible', style: `right:20px; top:120px; width:360px; z-index:1400;` });
    const header = el('div', { class: 'floating-window-header' });
    const h3 = el('h3', {}, title);
    const closeBtn = el('button', { class: 'floating-window-close', title: 'Fermer' }, '✕');
    header.appendChild(h3);
    header.appendChild(closeBtn);
    fw.appendChild(header);

    const body = el('div', { style: 'display:flex; gap:10px; align-items:flex-start;' });

    // Preview canvas
    const previewCol = el('div', {});
    const previewW = PREVIEW_CSS_W;
    const aspect = camera.aspect || (16/9);
    const previewH = Math.min(PREVIEW_CSS_MAX_H, Math.round(previewW / aspect));
    const previewCanvas = el('canvas', { id: `cam_preview_${idx}` });
    previewCanvas.style.width = previewW + 'px';
    previewCanvas.style.height = previewH + 'px';
    previewCanvas.width = Math.max(1, Math.floor(previewW * (window.devicePixelRatio || 1)));
    previewCanvas.height = Math.max(1, Math.floor(previewH * (window.devicePixelRatio || 1)));
    previewCanvas.style.background = '#000';
    previewCol.appendChild(previewCanvas);
    body.appendChild(previewCol);

    // Controls
    const ctrl = el('div', { style: 'display:flex;flex-direction:column;gap:8px;width:150px;' });
    const info = el('div', { style: 'font-size:11px;color:#aaa' }, `Aspect ${aspect.toFixed(2)}`);
    const captureSingle = el('button', {}, 'Capture 4K PNG');
    const captureSeq = el('button', {}, 'Capture N frames 4K');
    const seqParams = el('div', { style: 'display:flex;gap:6px;align-items:center;' });
    const framesInput = el('input', { type: 'number', style: 'width:60px;padding:4px;font-size:12px', value: 60 });
    const fpsInput = el('input', { type: 'number', style: 'width:60px;padding:4px;font-size:12px', value: 30 });
    seqParams.appendChild(framesInput);
    seqParams.appendChild(fpsInput);
    const recordBtn = el('button', { style: 'background:#444' }, 'Start Record');
    const downloadRec = el('button', { style: 'background:#444' }, 'Download Recording');
    const status = el('div', { style: 'font-size:12px;color:#0d9488' }, '');
    ctrl.appendChild(info);
    ctrl.appendChild(captureSingle);
    ctrl.appendChild(captureSeq);
    ctrl.appendChild(seqParams);
    ctrl.appendChild(recordBtn);
    ctrl.appendChild(downloadRec);
    ctrl.appendChild(status);
    body.appendChild(ctrl);

    fw.appendChild(body);
    document.body.appendChild(fw);

    closeBtn.addEventListener('click', ()=>{ fw.remove(); camera.__previewAttached = false; });

    // preview renderer on small canvas (for UI only)
    let smallRenderer;
    try {
      smallRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
      smallRenderer.setPixelRatio(window.devicePixelRatio || 1);
      smallRenderer.setSize(previewCanvas.width, previewCanvas.height, false);
      if (window.renderer){ try { smallRenderer.toneMapping = window.renderer.toneMapping; smallRenderer.outputEncoding = window.renderer.outputEncoding; } catch(e){} }
    } catch(e){
      console.warn('[camera_preview_module] smallRenderer creation failed', e);
    }

    // high-res renderer used for exports (offscreen)
    let hiRenderer, hiCanvas;
    function ensureHiRenderer(){
      if (hiRenderer) return;
      hiCanvas = document.createElement('canvas');
      hiCanvas.width = EXPORT_WIDTH;
      hiCanvas.height = EXPORT_HEIGHT;
      try {
        hiRenderer = new THREE.WebGLRenderer({ canvas: hiCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
        hiRenderer.setPixelRatio(dpr);
        hiRenderer.setSize(EXPORT_WIDTH, EXPORT_HEIGHT, false);
        if (window.renderer){ try { hiRenderer.toneMapping = window.renderer.toneMapping; hiRenderer.outputEncoding = window.renderer.outputEncoding; } catch(e){} }
      } catch(err){
        console.warn('[camera_preview_module] hiRenderer failed', err);
        hiRenderer = null;
      }
    }

    // capture one high-quality frame and trigger download
    async function captureOneFrameDownload(namePrefix){
      status.textContent = 'Rendering 4K...';
      ensureHiRenderer();
      if (!hiRenderer){ status.textContent = 'No hiRenderer'; return; }
      try {
        // render
        hiRenderer.render(window.scene, camera);
        // toDataURL (PNG)
        const data = hiCanvas.toDataURL('image/png');
        // download
        const a = document.createElement('a');
        a.href = data;
        a.download = `${(namePrefix||title).replace(/\s+/g,'_')}_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        status.textContent = 'Saved';
      } catch(e){
        console.warn(e);
        status.textContent = 'Error';
      }
      setTimeout(()=>status.textContent = '', 2000);
    }

    // capture sequence of frames (N frames at fps), download or store
    async function captureSequence(nFrames, fps, namePrefix, onFrame){
      ensureHiRenderer();
      if (!hiRenderer) { status.textContent = 'No hiRenderer'; return; }
      const interval = 1000 / Math.max(1, fps);
      status.textContent = `Rendering ${nFrames} frames...`;
      for (let i=0;i<nFrames;i++){
        // render
        hiRenderer.render(window.scene, camera);
        const data = hiCanvas.toDataURL('image/png');
        if (typeof onFrame === 'function') onFrame(data, i);
        else {
          // auto download each file (may be blocked by browser after many files)
          const a = document.createElement('a');
          a.href = data;
          a.download = `${(namePrefix||title).replace(/\s+/g,'_')}_${String(i).padStart(4,'0')}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        // wait interval
        await new Promise(r => setTimeout(r, interval));
      }
      status.textContent = 'Sequence done';
      setTimeout(()=>status.textContent = '', 2000);
    }

    // Recording buffer (dataURLs)
    camera.__recBuffer = camera.__recBuffer || [];
    let recording = false;
    let recCount = 0;

    recordBtn.addEventListener('click', ()=>{
      recording = !recording;
      recordBtn.textContent = recording ? 'Stop Record' : 'Start Record';
      recordBtn.style.background = recording ? '#0d9488' : '#444';
      if (recording){
        camera.__recBuffer = [];
        status.textContent = 'Recording...';
      } else {
        status.textContent = `Recorded ${camera.__recBuffer.length} frames`;
      }
    });

    downloadRec.addEventListener('click', async ()=>{
      const buf = camera.__recBuffer || [];
      if (!buf.length) { status.textContent = 'No frames recorded'; setTimeout(()=>status.textContent='',1500); return; }
      status.textContent = 'Preparing download...';
      // If JSZip available, zip and download
      if (window.JSZip){
        const zip = new window.JSZip();
        for (let i=0;i<buf.length;i++){
          const base64 = buf[i].split(',')[1];
          zip.file(`${title.replace(/\s+/g,'_')}_${String(i).padStart(4,'0')}.png`, base64, {base64:true});
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${title.replace(/\s+/g,'_')}_recording_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        status.textContent = 'Downloaded zip';
      } else {
        // fallback: download each image
        for (let i=0;i<buf.length;i++){
          const a = document.createElement('a');
          a.href = buf[i];
          a.download = `${title.replace(/\s+/g,'_')}_${String(i).padStart(4,'0')}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          await new Promise(r=>setTimeout(r, 200)); // small gap
        }
        status.textContent = 'Downloaded frames';
      }
      setTimeout(()=>status.textContent = '',2000);
    });

    captureSingle.addEventListener('click', ()=> captureOneFrameDownload(title));

    captureSeq.addEventListener('click', ()=>{
      const n = Math.max(1, parseInt(framesInput.value || 60));
      const fps = Math.max(1, parseInt(fpsInput.value || 30));
      // Offer to collect into zip if JSZip present
      if (window.JSZip){
        status.textContent = 'Rendering into zip...';
        const zip = new window.JSZip();
        captureSequence(n, fps, title, (data,i)=>{
          const base64 = data.split(',')[1];
          zip.file(`${title.replace(/\s+/g,'_')}_${String(i).padStart(4,'0')}.png`, base64, {base64:true});
          // when last frame, generate zip
          if (i === n-1){
            zip.generateAsync({type:'blob'}).then(blob=>{
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${title.replace(/\s+/g,'_')}_sequence_${Date.now()}.zip`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              status.textContent = 'Sequence ZIP ready';
            });
          }
        });
      } else {
        // direct downloads (may trigger many browser downloads)
        captureSequence(n, fps, title);
      }
    });

    // Preview loop & recording capture
    function previewLoop(){
      try {
        if (smallRenderer && camera){
          smallRenderer.render(window.scene, camera);
        }
        // if recording, capture a frame into buffer (but not every rAF; limit to fps for safety)
        if (recording){
          // capturing full 4K each frame is expensive; we capture at a controlled interval
          const now = performance.now();
          // simple approach: capture every rAF (may be heavy). For a safer mode, user can capture sequence instead.
          ensureHiRenderer();
          if (hiRenderer){
            hiRenderer.render(window.scene, camera);
            try {
              const data = hiCanvas.toDataURL('image/png');
              camera.__recBuffer.push(data);
              recCount++;
              status.textContent = `Recording ${recCount} frames`;
            } catch(e){}
          }
        }
      } catch(e){}
      camera.__previewLoopHandle = requestAnimationFrame(previewLoop);
    }
    camera.__previewLoopHandle = requestAnimationFrame(previewLoop);

    // cleanup on remove
    fw.addEventListener('remove', ()=>{
      try { cancelAnimationFrame(camera.__previewLoopHandle); } catch(e){}
      try { smallRenderer && smallRenderer.dispose && smallRenderer.dispose(); } catch(e){}
      try { hiRenderer && hiRenderer.dispose && hiRenderer.dispose(); } catch(e){}
      camera.__previewAttached = false;
    });

    // make accessible
    camera.__previewUI = { element: fw, previewCanvas };

    return fw;
  }

  // When Camera button is clicked, we listen for next camera added to scene and attach preview.
  function watchCameraButton(){
    const camBtn = findCameraButton();
    if (!camBtn) { console.warn('[camera_preview_module] Camera button not found'); return; }
    camBtn.addEventListener('click', ()=>{
      // Setup a one-time hook: monkeypatch scene.add for short time to catch added camera
      if (!window.scene || !window.THREE) return;
      const originalAdd = window.scene.add.bind(window.scene);
      let done = false;
      window.scene.add = function(...objs){
        // call original immediately
        const res = originalAdd(...objs);
        try {
          for (const o of objs){
            if (!o) continue;
            // detect if o is a Camera (Perspective/Orthographic)
            if ((o.isCamera || (window.THREE && o instanceof window.THREE.Camera)) && !done){
              // ensure not a projector camera
              setTimeout(()=>{
                if (!isProjectorCamera(o)){
                  console.log('[camera_preview_module] Detected camera created from Camera button, attaching preview.');
                  attachPreviewToCamera(o);
                } else {
                  console.log('[camera_preview_module] Detected camera but it belongs to a projector; skipping.');
                }
              }, 50);
              done = true;
            }
          }
        } catch(e){ console.warn(e); }
        return res;
      };
      // restore after timeout (5s)
      setTimeout(()=>{ try { window.scene.add = originalAdd; } catch(e){} }, 5000);
    });
  }

  // Fallback: if cameras might be created without scene.add, we also watch children length change briefly after click
  function watchCameraButtonMutation(){
    const btn = findCameraButton();
    if (!btn || !window.scene) return;
    btn.addEventListener('click', ()=>{
      const prevCount = window.scene ? window.scene.children.length : 0;
      const t0 = performance.now();
      const poll = setInterval(()=>{
        const now = performance.now();
        if (!window.scene) { clearInterval(poll); return; }
        const cur = window.scene.children.length;
        if (cur > prevCount){
          // find new cameras among children
          for (let i=prevCount;i<cur;i++){
            const c = window.scene.children[i];
            if (c && (c.isCamera || (window.THREE && c instanceof window.THREE.Camera))){
              if (!isProjectorCamera(c)) attachPreviewToCamera(c);
            }
          }
          clearInterval(poll);
        }
        if (now - t0 > 5000) clearInterval(poll);
      }, 200);
    });
  }

  // Start when ready
  function startWhenReady(){
    if (!window.THREE || !window.scene) {
      setTimeout(startWhenReady, 500);
      return;
    }
    // Hook camera button
    watchCameraButton();
    watchCameraButtonMutation();
    console.log('[camera_preview_module] Ready: will attach previews to cameras created from Camera button (projectors excluded).');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') startWhenReady();
  else window.addEventListener('DOMContentLoaded', startWhenReady);

  // Public helper to attach to an already created camera (manual)
  window.attachCameraPreview = function(camera, label){
    try { return attachPreviewToCamera(camera, label); } catch(e){ console.warn(e); return null; }
  };

})();