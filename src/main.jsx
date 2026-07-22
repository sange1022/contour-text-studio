import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const phases = [
  { name: '轮廓', radius: 8 },
  { name: '圆化', radius: 72 },
  { name: '粒子', radius: 50 },
  { name: '网格', radius: 6 },
  { name: '回吸', radius: 36 },
];

const DEFAULT_CANVAS = { width: 800, height: 1000 };
const MAX_ANALYSIS_EDGE = 560;

function imageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildContourAnalysis(image, settings) {
  const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.filter = `blur(${(settings.smooth / 100) * 2.2}px)`;
  context.drawImage(image, 0, 0, width, height);
  context.filter = 'none';

  const pixels = context.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);
  const threshold = settings.threshold;
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const alpha = pixels.data[offset + 3] / 255;
    const luminance = pixels.data[offset] * 0.299 + pixels.data[offset + 1] * 0.587 + pixels.data[offset + 2] * 0.114;
    const foreground = settings.invert ? luminance >= threshold : luminance <= threshold;
    mask[index] = alpha > 0.08 && foreground ? 1 : 0;
  }

  const visited = new Uint8Array(mask.length);
  const components = [];
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    const component = [];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const point = queue[cursor];
      component.push(point);
      const x = point % width;
      const y = Math.floor(point / width);
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push(component);
  }

  components.sort((a, b) => b.length - a.length);
  const sourceToAnalysisArea = (width * height) / (image.naturalWidth * image.naturalHeight);
  const minimumArea = Math.max(2, settings.area * sourceToAnalysisArea);
  const retained = components.filter((component, index) => index === 0 || component.length >= minimumArea);
  mask.fill(0);
  retained.forEach(component => component.forEach(index => { mask[index] = 1; }));

  const exterior = new Uint8Array(mask.length);
  const exteriorQueue = [];
  const enqueueExterior = (x, y) => {
    const index = y * width + x;
    if (!mask[index] && !exterior[index]) {
      exterior[index] = 1;
      exteriorQueue.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) { enqueueExterior(x, 0); enqueueExterior(x, height - 1); }
  for (let y = 0; y < height; y += 1) { enqueueExterior(0, y); enqueueExterior(width - 1, y); }
  for (let cursor = 0; cursor < exteriorQueue.length; cursor += 1) {
    const point = exteriorQueue[cursor];
    const x = point % width;
    const y = Math.floor(point / width);
    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) enqueueExterior(nx, ny);
    }
  }

  const edge = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      const adjacent = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .filter(([nx, ny]) => nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny * width + nx]);
      if (adjacent.length) {
        const inner = adjacent.every(([nx, ny]) => nx >= 0 && nx < width && ny >= 0 && ny < height && !exterior[ny * width + nx]);
        edge.push({ x, y, inner });
      }
    }
  }

  const step = Math.max(1, Math.ceil(edge.length / 1400));
  const sampledEdge = edge.filter((_, index) => index % step === 0);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskContext = maskCanvas.getContext('2d');
  const maskPixels = maskContext.createImageData(width, height);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    maskPixels.data[offset] = 11;
    maskPixels.data[offset + 1] = 12;
    maskPixels.data[offset + 2] = 12;
    maskPixels.data[offset + 3] = 255;
  }
  maskContext.putImageData(maskPixels, 0, 0);

  return { width, height, maskUrl: maskCanvas.toDataURL('image/png'), edge: sampledEdge };
}

function useContourAnalysis(source, settings) {
  const [analysis, setAnalysis] = useState(null);
  useEffect(() => {
    if (!source?.url) {
      setAnalysis(null);
      return undefined;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setAnalysis(buildContourAnalysis(image, settings));
    };
    image.src = source.url;
    return () => { cancelled = true; };
  }, [source?.url, settings.threshold, settings.smooth, settings.area, settings.invert]);
  return analysis;
}

const Icon = ({ name, size = 18 }) => {
  const paths = {
    upload: <><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5h14v-5"/></>,
    export: <><path d="M12 15V3M7 10l5 5 5-5"/><path d="M5 17v4h14v-4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, undo: <path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6"/>,
    redo: <path d="m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6"/>, trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4M7 7l1 14h8l1-14"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.2 2.3c-.7.3-.9.8-.9 1.7M12 17h.01"/></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 4"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    zoomIn: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M10 7v6M7 10h6"/></>,
    zoomOut: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M7 10h6"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

function Button({ children, icon, primary = false, onClick, className = '' }) {
  return <button className={`button ${primary ? 'primary' : ''} ${className}`} onClick={onClick}>{icon ? <Icon name={icon}/> : null}<span>{children}</span></button>;
}

function Topbar({ onImport, onExport, format, setFormat }) {
  return <header className="topbar">
    <div className="brand"><strong>轮廓文字</strong><span>POSTER CONTOUR LAB</span></div>
    <div className="utilities">
      <Button icon="upload" onClick={onImport}>导入图片</Button>
      <select aria-label="导出格式" value={format} onChange={event=>setFormat(event.target.value)}><option>PNG</option><option>SVG</option></select>
      <Button icon="export" primary onClick={onExport}>导出海报</Button>
    </div>
  </header>;
}

function SourcePanel({ sources, selected, onSelect, onImport, onRemove }) {
  return <div className="left-panel">
    <div className="panel-title"><span><b>01</b> 素材</span><small>{sources.length} / 5</small></div>
    <div className="source-list">
      {sources.map((s, idx) => <button key={s.id} className={`source-item ${selected === s.id ? 'selected' : ''}`} onClick={() => onSelect(s.id)}>
        <span className="source-index">{idx + 1}</span>
        <img src={s.url} alt={s.name}/>
        <span className="source-name">{s.name}</span>
        <span className="remove" role="button" onClick={(e)=>{e.stopPropagation();onRemove(s.id)}}>×</span>
      </button>)}
      {sources.length < 5 ? <button className="dropzone" onClick={onImport}><Icon name="plus"/><strong>添加图片</strong><small>PNG / JPG / WEBP</small></button> : null}
    </div>
    <p className="source-help">支持 1–5 张，画布使用当前图片原始尺寸。</p>
  </div>;
}

function ContourTile({ shape, hollow, size, radius, colors, strokeWidth, character, rotation }) {
  const fill = hollow ? 'none' : colors.tile;
  const stroke = hollow ? colors.tile : colors.tileBorder;
  const textColor = hollow ? colors.tile : colors.text;
  const common = { fill, stroke, strokeWidth };
  return <g>
    {shape === 'circle' ? <circle r={size} {...common}/> : shape === 'triangle' ? <path d={`M0 ${-size * 1.16} L${size * 1.08} ${size * .88} L${-size * 1.08} ${size * .88} Z`} {...common}/> : <rect x={-size} y={-size} width={size * 2} height={size * 2} rx={radius} {...common}/>}
    <text fill={textColor} fontSize={size * 1.12} fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`translate(0 ${shape === 'triangle' ? size * .12 : 0}) rotate(${-rotation})`}>{character}</text>
  </g>;
}

function CanvasArt({ phase, settings, source, toggles, customText, colors, tileShape, hollowTiles }) {
  const analysis = useContourAnalysis(source, settings);
  const words = (customText || 'FORM FOLLOWS FEELING').toUpperCase();
  const hasImportedImage = Boolean(source?.url);
  const canvasWidth = source?.width || DEFAULT_CANVAS.width;
  const canvasHeight = source?.height || DEFAULT_CANVAS.height;
  const minimumSide = Math.min(canvasWidth, canvasHeight);
  const edgeElements = useMemo(() => {
    if (!analysis?.edge.length) return [];
    const targetCount = Math.max(40, Math.round(60 + settings.density * 3.2));
    const step = Math.max(1, Math.ceil(analysis.edge.length / targetCount));
    const scaleX = canvasWidth / analysis.width;
    const scaleY = canvasHeight / analysis.height;
    return analysis.edge.filter((_, index) => index % step === 0).map((point, index) => ({
      x: point.x * scaleX,
      y: point.y * scaleY,
      inner: point.inner,
      size: Math.max(1.5, minimumSide * (settings.size / 1000) * (0.55 + (index % 5) * 0.12)),
      rotation: (index * 29) % 180,
    }));
  }, [analysis, canvasWidth, canvasHeight, minimumSide, settings.density, settings.size]);
  const showMask = phase === 0 || phase === 1 || phase === 4;
  const scatter = phase === 2 ? 1 + settings.spread / 260 : phase === 3 ? 1.02 : phase === 1 ? 0.99 : 1;
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const phaseScale = 1;
  const headingSize = Math.max(9, minimumSide * 0.022);
  return <svg id="artboard" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} data-width={canvasWidth} data-height={canvasHeight} role="img" aria-label="轮廓海报画布">
    <rect className="canvas-background" width={canvasWidth} height={canvasHeight} fill={colors.background}/>
    {hasImportedImage && toggles.original ? <image className="source-background" href={source.url} x="0" y="0" width={canvasWidth} height={canvasHeight} preserveAspectRatio="none"/> : null}
    <defs>
      <filter id="roundedContour" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation={Math.max(0.4, minimumSide * 0.004 * phases[phase].radius / 100)}/>
        <feComponentTransfer><feFuncA type="table" tableValues="0 0 1 1"/></feComponentTransfer>
      </filter>
      <filter id="colorizeContour" colorInterpolationFilters="sRGB"><feFlood floodColor={colors.subject}/><feComposite in2="SourceAlpha" operator="in"/></filter>
    </defs>
    {hasImportedImage && !analysis ? <g className="analysis-loading" fill="#fff"><text x={centerX} y={centerY} textAnchor="middle" fontSize={headingSize}>正在识别图片轮廓…</text></g> : null}
    {hasImportedImage && analysis && toggles.shape && showMask ? <g transform={`translate(${centerX} ${centerY}) scale(${phaseScale}) translate(${-centerX} ${-centerY})`} filter={phase === 1 ? 'url(#roundedContour)' : undefined}><image className={`detected-mask detected-mask-${phase}`} href={analysis.maskUrl} x="0" y="0" width={canvasWidth} height={canvasHeight} preserveAspectRatio="none" filter="url(#colorizeContour)" opacity={phase === 4 ? 0.88 : 1}/></g> : null}
    {!hasImportedImage ? <g className="empty-poster" fill="#fff" opacity=".72"><text x={centerX} y={centerY - 8} textAnchor="middle" fontSize={Math.max(16, minimumSide * .026)} fontWeight="600">上传图片开始制作海报</text><text x={centerX} y={centerY + 24} textAnchor="middle" fontSize={Math.max(9, minimumSide * .014)} opacity=".65">画布将自动使用图片原始尺寸</text></g> : null}
    {analysis ? <g className="particles">
      {edgeElements.map((point, index) => {
        const textEnabled = point.inner ? toggles.innerText : toggles.text;
        if (!textEnabled && phase !== 2 && phase !== 3) return null;
        const looseX = phase === 2 ? Math.sin(index * 2.7) * point.size * settings.spread / 35 : 0;
        const looseY = phase === 2 ? Math.cos(index * 1.9) * point.size * settings.spread / 35 : 0;
        return <g key={`${point.x}-${point.y}`} data-contour={point.inner?'inner':'outer'} transform={`translate(${centerX + (point.x - centerX) * scatter * phaseScale + looseX} ${centerY + (point.y - centerY) * scatter * phaseScale + looseY}) rotate(${point.rotation})`}>
          {textEnabled ? <ContourTile shape={tileShape} hollow={hollowTiles} size={point.size} radius={phase === 1 ? point.size * .45 : phases[phase].radius * point.size / 130} colors={colors} strokeWidth={Math.max(.65, minimumSide * .0011)} character={words[index % words.length] || 'A'} rotation={point.rotation}/> : phase === 3 ? <rect x={-point.size} y={-point.size} width={point.size * 2} height={point.size * 2} fill="none" stroke={colors.tile} strokeWidth={Math.max(0.6, minimumSide * 0.0015)}/> : <circle r={point.size * 0.62} fill={colors.tile}/>} 
        </g>;
      })}
    </g> : null}
  </svg>;
}

function RangeRow({ label, value, min=0, max=100, unit='', onChange }) {
  return <label className="control-row"><span>{label}</span><output>{value}{unit}</output><input type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
}

function Toggle({ label, checked, onChange }) { return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i/></label>; }

function Section({ title, children }) { return <section className="inspector-section"><h3>{title}<span>⌃</span></h3><div className="section-body">{children}</div></section>; }

function Inspector({ phase, setPhase, settings, setSettings, text, setText, toggles, setToggles, colors, setColors, tileShape, setTileShape, hollowTiles, setHollowTiles, transparent, setTransparent }) {
  const set = (k,v)=>setSettings(s=>({...s,[k]:v}));
  const setColor = (k,v)=>setColors(current=>({...current,[k]:v}));
  return <aside className="inspector">
    <Section title="02　轮廓">
      <RangeRow label="阈值" value={settings.threshold} max={255} onChange={v=>set('threshold',v)}/>
      <RangeRow label="平滑" value={settings.smooth} onChange={v=>set('smooth',v)}/>
      <RangeRow label="最小面积" value={settings.area} max={800} unit=" px²" onChange={v=>set('area',v)}/>
      <div className="toggle-grid">
        <Toggle label="反转前景" checked={settings.invert} onChange={v=>set('invert',v)}/>
        <Toggle label="显示原图" checked={toggles.original} onChange={v=>setToggles(t=>({...t,original:v}))}/>
        <Toggle label="显示主体" checked={toggles.shape} onChange={v=>setToggles(t=>({...t,shape:v}))}/>
        <Toggle label="外轮廓文字" checked={toggles.text} onChange={v=>setToggles(t=>({...t,text:v}))}/>
        <Toggle label="孔洞文字" checked={toggles.innerText} onChange={v=>setToggles(t=>({...t,innerText:v}))}/>
      </div>
    </Section>
    <Section title="03　文字与样式">
      <label className="field-row"><span>海报文字</span><input value={text} onChange={e=>setText(e.target.value)} /></label>
      <div className="style-label">海报样式</div>
      <div className="phase-tabs">{phases.map((item,index)=><button key={item.name} className={phase===index?'active':''} onClick={()=>setPhase(index)}>{item.name}</button>)}</div>
      <div className="shape-setting"><span>文字底形</span><div className="shape-picker">
        <button aria-label="正方形" title="正方形" className={tileShape==='square'?'active':''} onClick={()=>setTileShape('square')}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14"/></svg></button>
        <button aria-label="圆形" title="圆形" className={tileShape==='circle'?'active':''} onClick={()=>setTileShape('circle')}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/></svg></button>
        <button aria-label="三角形" title="三角形" className={tileShape==='triangle'?'active':''} onClick={()=>setTileShape('triangle')}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.8 18 17H2Z"/></svg></button>
      </div></div>
      <Toggle label="空心形状" checked={hollowTiles} onChange={setHollowTiles}/>
      <RangeRow label="文字大小" value={settings.size} min={4} max={60} unit=" px" onChange={v=>set('size',v)}/>
      <RangeRow label="文字密度" value={settings.density} unit="%" onChange={v=>set('density',v)}/>
      <RangeRow label="扩散" value={settings.spread} unit="%" onChange={v=>set('spread',v)}/>
      <div className="color-grid">
        <label>文字颜色<input type="color" value={colors.text} onChange={e=>setColor('text',e.target.value)}/><code>{colors.text}</code></label>
        <label>形状颜色<input type="color" value={colors.tile} onChange={e=>setColor('tile',e.target.value)}/><code>{colors.tile}</code></label>
        <label>边框颜色<input type="color" value={colors.tileBorder} onChange={e=>setColor('tileBorder',e.target.value)}/><code>{colors.tileBorder}</code></label>
        <label>主体颜色<input type="color" value={colors.subject} onChange={e=>setColor('subject',e.target.value)}/><code>{colors.subject}</code></label>
        <label>背景颜色<input type="color" value={colors.background} onChange={e=>setColor('background',e.target.value)}/><code>{colors.background}</code></label>
      </div>
      <div className="font-row compact"><span>字体</span><button className="upload-font">上传 TTF / OTF</button></div>
      <Toggle label="透明背景" checked={transparent} onChange={setTransparent}/>
    </Section>
  </aside>;
}

function App() {
  const fileRef = useRef(null);
  const [sources,setSources] = useState([]);
  const [selected,setSelected] = useState(null);
  const [phase,setPhase] = useState(0);
  const [text,setText] = useState('FORM FOLLOWS FEELING');
  const [zoom,setZoom] = useState(100);
  const [format,setFormat] = useState('PNG');
  const [transparent,setTransparent] = useState(false);
  const [toast,setToast] = useState('');
  const [toggles,setToggles] = useState({original:true,shape:false,text:true,innerText:true});
  const [tileShape,setTileShape] = useState('square');
  const [hollowTiles,setHollowTiles] = useState(false);
  const [colors,setColors] = useState({subject:'#2457ff',background:'#000000',tile:'#ffffff',tileBorder:'#d8d8d8',text:'#000000'});
  const [settings,setSettings] = useState({threshold:155,smooth:2,area:28,invert:false,size:22,spread:30,density:58});
  const activeSource = sources.find(s=>s.id===selected);
  const canvasSize = {width:activeSource?.width || DEFAULT_CANVAS.width,height:activeSource?.height || DEFAULT_CANVAS.height};
  const actualSourceCount = sources.length;
  const triggerImport = ()=>fileRef.current?.click();
  const onFiles = async e => {
    const files = Array.from(e.target.files||[]).slice(0,Math.max(0,5-actualSourceCount));
    if (!files.length) return;
    const next = await Promise.all(files.map(async (file,i)=>{
      const url=await fileToDataUrl(file);
      const dimensions=await imageDimensions(url);
      return {id:Date.now()+i,name:file.name.replace(/\.[^.]+$/,''),url,...dimensions};
    }));
    setSources(current=>[...current,...next]);
    setSelected(next[0].id);
    setZoom(100);
    setToast(`已识别 ${next.length} 张图片 · 画布 ${next[0].width} × ${next[0].height}`);
    setTimeout(()=>setToast(''),2200);
    e.target.value='';
  };
  const removeSource = id => setSources(current=>{
    const target=current.find(source=>source.id===id);
    const next=current.filter(source=>source.id!==id);
    if(selected===id) setSelected(next[0]?.id ?? null);
    return next;
  });
  const exportImage = () => {
    const svg = document.getElementById('artboard');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    if (transparent) clone.querySelector('.canvas-background')?.setAttribute('fill','none');
    const data = new XMLSerializer().serializeToString(clone);
    if (format==='SVG') {
      const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'image/svg+xml'})); a.download=`轮廓文字-${phases[phase].name}.svg`; a.click();
    } else {
      const img=new Image(); const url=URL.createObjectURL(new Blob([data],{type:'image/svg+xml'})); img.onload=()=>{const c=document.createElement('canvas');c.width=canvasSize.width;c.height=canvasSize.height;const ctx=c.getContext('2d');if(!transparent){ctx.fillStyle=colors.background;ctx.fillRect(0,0,c.width,c.height)}ctx.drawImage(img,0,0,c.width,c.height);c.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`轮廓文字-${phases[phase].name}-${canvasSize.width}x${canvasSize.height}.png`;a.click();},'image/png');URL.revokeObjectURL(url)};img.src=url;
    }
    setToast(`正在导出 ${format} 图片`); setTimeout(()=>setToast(''),1800);
  };
  return <div className="app-shell">
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={onFiles}/>
    <Topbar onImport={triggerImport} onExport={exportImage} format={format} setFormat={setFormat}/>
    <aside className="control-sidebar">
      <SourcePanel sources={sources} selected={selected} onSelect={setSelected} onImport={triggerImport} onRemove={removeSource}/>
      <Inspector phase={phase} setPhase={setPhase} settings={settings} setSettings={setSettings} text={text} setText={setText} toggles={toggles} setToggles={setToggles} colors={colors} setColors={setColors} tileShape={tileShape} setTileShape={setTileShape} hollowTiles={hollowTiles} setHollowTiles={setHollowTiles} transparent={transparent} setTransparent={setTransparent}/>
    </aside>
    <main className="workspace">
      <div className="canvas-toolbar"><strong>海报画布</strong><span>原始尺寸：{canvasSize.width} × {canvasSize.height} px</span><button onClick={()=>setZoom(z=>Math.max(50,z-10))}><Icon name="zoomOut"/></button><output>{zoom}%</output><button onClick={()=>setZoom(z=>Math.min(130,z+10))}><Icon name="zoomIn"/></button></div>
      <div className="canvas-viewport"><div className="canvas-sheet" style={{transform:`scale(${zoom/100})`,aspectRatio:`${canvasSize.width}/${canvasSize.height}`}}><CanvasArt phase={phase} settings={settings} source={activeSource} toggles={toggles} customText={text} colors={colors} tileShape={tileShape} hollowTiles={hollowTiles}/></div></div>
    </main>
    {toast ? <div className="toast">{toast}</div> : null}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
