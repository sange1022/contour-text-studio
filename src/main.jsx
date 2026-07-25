import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fileToDataUrl, imageDimensions, useContourAnalysis } from './contour';
import './styles.css';

const DEFAULT_CANVAS = { width: 1080, height: 1350 };
const DEFAULT_CELL = { x: 0, y: 0, scaleX: 100, scaleY: 100, skew: 0, blur: 0, effect: 'none', intensity: 72 };
const TECH_EFFECTS = [
  { id: 'glitch', name: '数据故障', code: 'GL', preset: { x: 28, scaleX: 148, skew: -8 } },
  { id: 'slice', name: '数字切片', code: 'SL', preset: { x: -38, scaleX: 172, scaleY: 82 } },
  { id: 'scanline', name: 'CRT 扫描', code: 'CR', preset: { scaleX: 138, scaleY: 72 } },
  { id: 'hologram', name: '全息偏色', code: 'HO', preset: { x: 16, scaleX: 152, skew: 7 } },
  { id: 'ripple', name: '信号波纹', code: 'RP', preset: { scaleX: 142, scaleY: 88 } },
  { id: 'liquid', name: '液态融化', code: 'LQ', preset: { y: 24, scaleX: 128, scaleY: 146, skew: 12 } },
  { id: 'glass', name: '玻璃折射', code: 'RF', preset: { x: 20, scaleX: 158, scaleY: 78, blur: 1 } },
  { id: 'thermal', name: '热成像', code: 'TH', preset: { scaleX: 134, scaleY: 92 } },
  { id: 'xray', name: 'X 光反相', code: 'XR', preset: { scaleX: 126, scaleY: 68, skew: -5 } },
  { id: 'halftone', name: '数码网点', code: 'HT', preset: { scaleX: 146, scaleY: 76 } },
];
const PHASES = [
  { name: '贴合', radius: 8 },
  { name: '圆化', radius: 72 },
  { name: '散点', radius: 50 },
  { name: '网格', radius: 6 },
];
const CANVAS_PRESETS = [
  { value: 'original', label: '原图尺寸' },
  { value: 'square', label: '1:1 · 1080 × 1080', width: 1080, height: 1080 },
  { value: 'portrait', label: '3:4 · 1080 × 1440', width: 1080, height: 1440 },
  { value: 'social', label: '4:5 · 1080 × 1350', width: 1080, height: 1350 },
  { value: 'story', label: '9:16 · 1080 × 1920', width: 1080, height: 1920 },
  { value: 'landscape', label: '16:9 · 1920 × 1080', width: 1920, height: 1080 },
  { value: 'a4', label: 'A4 · 2480 × 3508', width: 2480, height: 3508 },
  { value: 'a3', label: 'A3 · 3508 × 4961', width: 3508, height: 4961 },
];
const TEMPLATES = [
  {
    id: 'editorial', name: '形随感知', note: '黑白编辑',
    colors: { background: '#080808', subject: '#2457ff', tile: '#ffffff', tileBorder: '#ffffff', text: '#080808', posterText: '#ffffff' },
    tileShape: 'square', hollow: false, phase: 0,
    typography: { title: '形随感知', subtitle: 'FORM FOLLOWS FEELING', info: '2026.07.25 — 08.30\nBEIJING · ART DISTRICT', placement: 'top-left', titleSize: 92 },
    warp: { enabled: false },
  },
  {
    id: 'boundary', name: '边界之外', note: '空心轮廓',
    colors: { background: '#f4f4f4', subject: '#101010', tile: '#101010', tileBorder: '#101010', text: '#ffffff', posterText: '#101010' },
    tileShape: 'circle', hollow: true, phase: 1,
    typography: { title: '边界之外', subtitle: 'BEYOND THE BOUNDARY', info: 'VISUAL RESEARCH\nNO. 02 / 2026', placement: 'top-left', titleSize: 82 },
    warp: { enabled: false },
  },
  {
    id: 'deform', name: '局部形变', note: '网格压扁',
    colors: { background: '#ffffff', subject: '#2457ff', tile: '#ffffff', tileBorder: '#111111', text: '#111111', posterText: '#111111' },
    tileShape: 'square', hollow: true, phase: 0,
    typography: { title: '形态实验', subtitle: 'LOCAL DEFORMATION STUDY', info: 'GRID 06 × 08\nPOSTER SERIES', placement: 'top-left', titleSize: 88 },
    warp: { enabled: true, columns: 6, rows: 8 },
  },
  {
    id: 'signal', name: '蓝色信号', note: '钴蓝强调',
    colors: { background: '#2457ff', subject: '#080808', tile: '#ffffff', tileBorder: '#080808', text: '#080808', posterText: '#ffffff' },
    tileShape: 'triangle', hollow: false, phase: 2,
    typography: { title: '视觉信号', subtitle: 'SIGNAL / SHAPE / TYPE', info: '2026 DESIGN WEEK\nSHANGHAI', placement: 'bottom-left', titleSize: 86 },
    warp: { enabled: false },
  },
];

function Icon({ name, size = 18 }) {
  const paths = {
    upload: <><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5h14v-5"/></>,
    export: <><path d="M12 15V3M7 10l5 5 5-5"/><path d="M5 17v4h14v-4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    grid: <><path d="M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16"/></>,
    frame: <path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4"/>,
    reset: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Button({ children, icon, primary, onClick, className = '', disabled = false }) {
  return <button className={`button ${primary ? 'primary' : ''} ${className}`} onClick={onClick} disabled={disabled}>{icon ? <Icon name={icon}/> : null}<span>{children}</span></button>;
}

function Topbar({ onImport, onExport, format, setFormat, exportScale, setExportScale }) {
  return <header className="topbar">
    <div className="brand"><strong>轮廓文字</strong><span>专业静态海报编辑器</span></div>
    <div className="utilities">
      <Button icon="upload" onClick={onImport}>导入素材</Button>
      <select aria-label="导出格式" value={format} onChange={event=>setFormat(event.target.value)}><option>PNG</option><option>SVG</option></select>
      <select aria-label="导出质量" value={exportScale} onChange={event=>setExportScale(Number(event.target.value))} disabled={format === 'SVG'}><option value={1}>1×</option><option value={2}>2× 高清</option></select>
      <Button icon="export" primary onClick={onExport}>导出海报</Button>
    </div>
  </header>;
}

function Section({ number, title, children }) {
  return <section className="inspector-section"><h3><b>{number}</b>{title}</h3><div className="section-body">{children}</div></section>;
}

function RangeRow({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return <label className="control-row"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={event=>onChange(Number(event.target.value))}/><output>{value}{unit}</output></label>;
}

function Toggle({ label, checked, onChange }) {
  return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/><i/></label>;
}

function Field({ label, value, onChange, multiline = false }) {
  return <label className="field-row"><span>{label}</span>{multiline ? <textarea value={value} onChange={event=>onChange(event.target.value)}/> : <input value={value} onChange={event=>onChange(event.target.value)}/>}</label>;
}

function SourceSection({ sources, selected, onSelect, onImport, onRemove, layout, setLayout }) {
  return <Section number="01" title="素材">
    <div className="source-list">
      {sources.map((source, index)=><button key={source.id} className={`source-item ${selected === source.id ? 'selected' : ''}`} onClick={()=>onSelect(source.id)}>
        <span>{index + 1}</span><img src={source.url} alt={source.name}/><i role="button" onClick={event=>{event.stopPropagation();onRemove(source.id)}}>×</i>
      </button>)}
      {sources.length < 5 ? <button className="source-add" onClick={onImport}><Icon name="plus"/><small>添加图片</small></button> : null}
    </div>
    <div className="subhead">裁切与构图</div>
    <RangeRow label="图片缩放" value={layout.imageScale} min={100} max={220} unit="%" onChange={value=>setLayout(current=>({...current,imageScale:value}))}/>
    <RangeRow label="水平位置" value={layout.imageX} min={-60} max={60} unit="%" onChange={value=>setLayout(current=>({...current,imageX:value}))}/>
    <RangeRow label="垂直位置" value={layout.imageY} min={-60} max={60} unit="%" onChange={value=>setLayout(current=>({...current,imageY:value}))}/>
    <button className="line-button" onClick={()=>setLayout(current=>({...current,imageScale:100,imageX:0,imageY:0}))}><Icon name="reset" size={14}/>重置图片位置</button>
    <p className="microcopy">未启用局部网格时，也可以直接拖动画布中的原图。</p>
  </Section>;
}

function TemplateStrip({ selected, onApply }) {
  return <div className="template-strip">{TEMPLATES.map(template=><button key={template.id} className={`template-card ${selected === template.id ? 'active' : ''}`} onClick={()=>onApply(template)} style={{'--t-bg':template.colors.background,'--t-fg':template.colors.posterText,'--t-accent':template.colors.subject}}>
    <span className="template-title">{template.name}</span><span className="template-art"><i/><i/><i/></span><small>{template.note}</small>
  </button>)}</div>;
}

function WarpControls({ warp, setWarp }) {
  const cell = warp.cells[warp.selected] || DEFAULT_CELL;
  const updateCell = (field, value) => setWarp(current=>({...current,cells:{...current.cells,[current.selected]:{...DEFAULT_CELL,...current.cells[current.selected],[field]:value}}}));
  const applyPreset = preset => setWarp(current=>({...current,cells:{...current.cells,[current.selected]:{...DEFAULT_CELL,...preset}}}));
  const applyEffect = effect => applyPreset({ effect: effect.id, intensity: 72, ...effect.preset });
  const activeEffect = TECH_EFFECTS.find(effect=>effect.id === cell.effect);
  return <>
    <div className="warp-heading"><Toggle label="局部网格变形" checked={warp.enabled} onChange={enabled=>setWarp(current=>({...current,enabled}))}/><small>{warp.columns} × {warp.rows}</small></div>
    {warp.enabled ? <>
      <RangeRow label="横向格数" value={warp.columns} min={2} max={12} onChange={columns=>setWarp(current=>({...current,columns,selected:0,cells:{}}))}/>
      <RangeRow label="纵向格数" value={warp.rows} min={2} max={16} onChange={rows=>setWarp(current=>({...current,rows,selected:0,cells:{}}))}/>
      <div className="selected-cell">选中区域 <b>{String(warp.selected + 1).padStart(2, '0')}</b></div>
      <RangeRow label="X 位移" value={cell.x} min={-120} max={120} unit=" px" onChange={value=>updateCell('x',value)}/>
      <RangeRow label="Y 位移" value={cell.y} min={-120} max={120} unit=" px" onChange={value=>updateCell('y',value)}/>
      <RangeRow label="横向拉伸" value={cell.scaleX} min={40} max={220} unit="%" onChange={value=>updateCell('scaleX',value)}/>
      <RangeRow label="纵向压缩" value={cell.scaleY} min={20} max={180} unit="%" onChange={value=>updateCell('scaleY',value)}/>
      <RangeRow label="倾斜" value={cell.skew} min={-40} max={40} unit="°" onChange={value=>updateCell('skew',value)}/>
      <RangeRow label="模糊" value={cell.blur} min={0} max={18} unit=" px" onChange={value=>updateCell('blur',value)}/>
      {activeEffect ? <RangeRow label="特效强度" value={cell.intensity} min={10} max={100} unit="%" onChange={value=>updateCell('intensity',value)}/> : null}
      <div className="effect-heading"><span>科技感特效 · 10</span><b>{activeEffect?.code || 'OFF'}</b></div>
      <div className="tech-effects">
        {TECH_EFFECTS.map(effect=><button key={effect.id} className={cell.effect === effect.id ? 'active' : ''} onClick={()=>applyEffect(effect)}><b>{effect.code}</b><span>{effect.name}</span></button>)}
      </div>
      <button className="reset-effect" onClick={()=>applyPreset(DEFAULT_CELL)}><Icon name="reset" size={13}/>恢复选中区域</button>
    </> : null}
  </>;
}

function LayoutSection({ templateId, onApplyTemplate, layout, setLayout, warp, setWarp }) {
  return <Section number="02" title="版式">
    <div className="subhead">海报模板</div>
    <TemplateStrip selected={templateId} onApply={onApplyTemplate}/>
    <div className="subhead">画布辅助</div>
    <div className="toggle-grid"><Toggle label="网格参考线" checked={layout.showGrid} onChange={showGrid=>setLayout(current=>({...current,showGrid}))}/><Toggle label="安全边距" checked={layout.showSafe} onChange={showSafe=>setLayout(current=>({...current,showSafe}))}/></div>
    <RangeRow label="安全边距" value={layout.safeMargin} min={2} max={15} unit="%" onChange={safeMargin=>setLayout(current=>({...current,safeMargin}))}/>
    <div className="subhead">局部特效</div>
    <WarpControls warp={warp} setWarp={setWarp}/>
  </Section>;
}

function ShapePicker({ value, onChange }) {
  return <div className="shape-picker">
    <button aria-label="正方形" className={value === 'square' ? 'active' : ''} onClick={()=>onChange('square')}><i className="square"/></button>
    <button aria-label="圆形" className={value === 'circle' ? 'active' : ''} onClick={()=>onChange('circle')}><i className="circle"/></button>
    <button aria-label="三角形" className={value === 'triangle' ? 'active' : ''} onClick={()=>onChange('triangle')}><i className="triangle"/></button>
  </div>;
}

function ContourSection({ contourText, setContourText, settings, setSettings, toggles, setToggles, phase, setPhase, tileShape, setTileShape, hollow, setHollow, colors, setColors }) {
  const set = (field, value) => setSettings(current=>({...current,[field]:value}));
  const setColor = (field, value) => setColors(current=>({...current,[field]:value}));
  return <Section number="03" title="轮廓">
    <Field label="轮廓文字" value={contourText} onChange={setContourText}/>
    <RangeRow label="明暗阈值" value={settings.threshold} max={255} onChange={value=>set('threshold',value)}/>
    <RangeRow label="轮廓平滑" value={settings.smooth} onChange={value=>set('smooth',value)}/>
    <RangeRow label="最小面积" value={settings.area} max={800} unit=" px²" onChange={value=>set('area',value)}/>
    <div className="toggle-grid">
      <Toggle label="反转前景" checked={settings.invert} onChange={value=>set('invert',value)}/>
      <Toggle label="显示主体" checked={toggles.shape} onChange={shape=>setToggles(current=>({...current,shape}))}/>
      <Toggle label="外轮廓文字" checked={toggles.text} onChange={text=>setToggles(current=>({...current,text}))}/>
      <Toggle label="孔洞文字" checked={toggles.innerText} onChange={innerText=>setToggles(current=>({...current,innerText}))}/>
    </div>
    <div className="subhead">轮廓样式</div>
    <div className="phase-tabs">{PHASES.map((item,index)=><button key={item.name} className={phase === index ? 'active' : ''} onClick={()=>setPhase(index)}>{item.name}</button>)}</div>
    <label className="inline-control"><span>文字底形</span><ShapePicker value={tileShape} onChange={setTileShape}/></label>
    <Toggle label="空心形状" checked={hollow} onChange={setHollow}/>
    <RangeRow label="文字大小" value={settings.size} min={4} max={60} unit=" px" onChange={value=>set('size',value)}/>
    <RangeRow label="文字密度" value={settings.density} unit="%" onChange={value=>set('density',value)}/>
    <RangeRow label="扩散程度" value={settings.spread} unit="%" onChange={value=>set('spread',value)}/>
    <div className="color-row">
      <label>形状<input type="color" value={colors.tile} onChange={event=>setColor('tile',event.target.value)}/></label>
      <label>形内字<input type="color" value={colors.text} onChange={event=>setColor('text',event.target.value)}/></label>
      <label>主体<input type="color" value={colors.subject} onChange={event=>setColor('subject',event.target.value)}/></label>
    </div>
  </Section>;
}

function TypographySection({ typography, setTypography, onUploadFont, customFontName, colors, setColors }) {
  const set = (field, value) => setTypography(current=>({...current,[field]:value}));
  return <Section number="04" title="文字">
    <Field label="主标题" value={typography.title} onChange={value=>set('title',value)}/>
    <Field label="副标题" value={typography.subtitle} onChange={value=>set('subtitle',value)}/>
    <Field label="信息文字" value={typography.info} onChange={value=>set('info',value)} multiline/>
    <label className="field-row"><span>标题位置</span><select value={typography.placement} onChange={event=>set('placement',event.target.value)}><option value="top-left">左上</option><option value="top-center">顶部居中</option><option value="bottom-left">左下</option></select></label>
    <RangeRow label="标题大小" value={typography.titleSize} min={48} max={150} onChange={value=>set('titleSize',value)}/>
    <label className="field-row"><span>字体</span><select value={typography.fontFamily} onChange={event=>set('fontFamily',event.target.value)}><option value="Noto Sans SC">无衬线黑体</option><option value="IBM Plex Mono">等宽字体</option>{customFontName ? <option value={customFontName}>{customFontName}</option> : null}</select></label>
    <button className="line-button" onClick={onUploadFont}>上传 TTF / OTF 字体</button>
    <label className="color-field"><span>海报文字颜色</span><input type="color" value={colors.posterText} onChange={event=>setColors(current=>({...current,posterText:event.target.value}))}/><code>{colors.posterText}</code></label>
  </Section>;
}

function ContourTile({ shape, hollow, size, radius, colors, strokeWidth, character, rotation }) {
  const fill = hollow ? 'none' : colors.tile;
  const stroke = hollow ? colors.tile : colors.tileBorder;
  const textColor = hollow ? colors.tile : colors.text;
  return <g>{shape === 'circle' ? <circle r={size} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/> : shape === 'triangle' ? <path d={`M0 ${-size * 1.16} L${size * 1.08} ${size * .88} L${-size * 1.08} ${size * .88} Z`} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/> : <rect x={-size} y={-size} width={size * 2} height={size * 2} rx={radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>}<text fill={textColor} fontSize={size * 1.12} fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`translate(0 ${shape === 'triangle' ? size * .12 : 0}) rotate(${-rotation})`}>{character}</text></g>;
}

function TechFilter({ index, cell }) {
  const intensity = cell.intensity ?? 72;
  const effect = cell.effect || 'none';
  const amount = intensity / 100;
  const content = {
    glitch: <><feOffset in="SourceGraphic" dx={22 * amount} result="shiftR"/><feColorMatrix in="shiftR" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red"/><feOffset in="SourceGraphic" dx={-22 * amount} result="shiftC"/><feColorMatrix in="shiftC" values="0 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" result="cyan"/><feBlend in="red" in2="cyan" mode="screen" result="split"/><feBlend in="SourceGraphic" in2="split" mode="screen"/></>,
    slice: <><feTurbulence type="fractalNoise" baseFrequency={`0.006 ${0.08 + amount * .12}`} numOctaves="1" seed={index + 11} result="sliceNoise"/><feDisplacementMap in="SourceGraphic" in2="sliceNoise" scale={38 + 92 * amount} xChannelSelector="R" yChannelSelector="B"/></>,
    scanline: <><feColorMatrix type="saturate" values={.35 + amount * .35}/><feComponentTransfer><feFuncR type="linear" slope={1.15 + amount * .45}/><feFuncG type="linear" slope={1.05}/><feFuncB type="linear" slope={1.2 + amount * .25}/></feComponentTransfer></>,
    hologram: <><feColorMatrix type="hueRotate" values={120 + intensity * 2}/><feColorMatrix type="saturate" values={1.7 + amount * 2.3}/><feOffset dx={10 * amount} result="holoShift"/><feBlend in="SourceGraphic" in2="holoShift" mode="screen"/></>,
    ripple: <><feTurbulence type="turbulence" baseFrequency={`${.01 + amount * .014} ${.035 + amount * .035}`} numOctaves="1" seed={index + 23} result="rippleNoise"/><feDisplacementMap in="SourceGraphic" in2="rippleNoise" scale={22 + intensity * .75} xChannelSelector="R" yChannelSelector="G"/></>,
    liquid: <><feTurbulence type="fractalNoise" baseFrequency={`${.006 + amount * .006} ${.012 + amount * .01}`} numOctaves="2" seed={index + 37} result="liquidNoise"/><feDisplacementMap in="SourceGraphic" in2="liquidNoise" scale={35 + intensity * 1.15} xChannelSelector="B" yChannelSelector="R"/></>,
    glass: <><feTurbulence type="fractalNoise" baseFrequency={`${.018 + amount * .015} ${.008 + amount * .01}`} numOctaves="1" seed={index + 49} result="glassNoise"/><feDisplacementMap in="SourceGraphic" in2="glassNoise" scale={18 + intensity * .72} xChannelSelector="R" yChannelSelector="B"/><feComponentTransfer><feFuncR type="linear" slope="1.15" intercept=".02"/><feFuncG type="linear" slope="1.08"/><feFuncB type="linear" slope="1.22" intercept=".03"/></feComponentTransfer></>,
    thermal: <><feColorMatrix type="saturate" values="0" result="thermalGray"/><feComponentTransfer in="thermalGray"><feFuncR type="table" tableValues="0 .15 .95 1 1"/><feFuncG type="table" tableValues="0 .05 .75 .95 .15"/><feFuncB type="table" tableValues=".45 .95 .35 .05 0"/></feComponentTransfer></>,
    xray: <><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope={-1.2 - amount * .5} intercept="1.15"/><feFuncG type="linear" slope={-1.1 - amount * .35} intercept="1.08"/><feFuncB type="linear" slope={-1.35 - amount * .55} intercept="1.28"/></feComponentTransfer></>,
    halftone: <><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 .18 .48 .78 1"/><feFuncG type="discrete" tableValues="0 .18 .48 .78 1"/><feFuncB type="discrete" tableValues="0 .18 .48 .78 1"/></feComponentTransfer></>,
  }[effect];
  if (!content && cell.blur <= 0) return null;
  return <filter id={`tech-filter-${index}`} x="-45%" y="-45%" width="190%" height="190%" colorInterpolationFilters="sRGB">{content}{cell.blur > 0 ? <feGaussianBlur stdDeviation={cell.blur}/> : null}</filter>;
}

function EffectDefinitions({ index, cell }) {
  const intensity = cell.intensity ?? 72;
  return <>
    <TechFilter index={index} cell={cell}/>
    {cell.effect === 'scanline' ? <pattern id={`scanline-${index}`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="3" fill="#39ffea" opacity={.18 + intensity / 180}/><rect y="4" width="8" height="1" fill="#2457ff" opacity=".72"/></pattern> : null}
    {cell.effect === 'halftone' ? <pattern id={`halftone-${index}`} width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r={2 + intensity / 40} fill="#2457ff" opacity=".78"/><circle cx="12" cy="12" r={1.5 + intensity / 55} fill="#00e8ff" opacity=".62"/></pattern> : null}
    {cell.effect === 'hologram' ? <linearGradient id={`hologram-${index}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#00fff0" stopOpacity=".7"/><stop offset=".48" stopColor="#2457ff" stopOpacity=".1"/><stop offset="1" stopColor="#ff2bd6" stopOpacity=".72"/></linearGradient> : null}
    {cell.effect === 'glass' ? <linearGradient id={`glass-${index}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".08"/><stop offset=".45" stopColor="#fff" stopOpacity=".6"/><stop offset=".55" stopColor="#9dfcff" stopOpacity=".12"/><stop offset="1" stopColor="#fff" stopOpacity=".34"/></linearGradient> : null}
  </>;
}

function CellEffectOverlay({ index, cell, x, y, width, height }) {
  if (cell.effect === 'scanline') return <rect x={x} y={y} width={width} height={height} fill={`url(#scanline-${index})`} style={{mixBlendMode:'screen'}}/>;
  if (cell.effect === 'halftone') return <rect x={x} y={y} width={width} height={height} fill={`url(#halftone-${index})`} style={{mixBlendMode:'multiply'}}/>;
  if (cell.effect === 'hologram') return <rect x={x} y={y} width={width} height={height} fill={`url(#hologram-${index})`} opacity={(cell.intensity ?? 72) / 145} style={{mixBlendMode:'screen'}}/>;
  if (cell.effect === 'glass') return <rect x={x} y={y} width={width} height={height} fill={`url(#glass-${index})`} opacity=".72" style={{mixBlendMode:'screen'}}/>;
  if (cell.effect === 'glitch') return <g opacity=".82"><rect x={x} y={y + height * .18} width={width} height={Math.max(3,height * .035)} fill="#ff1f7a"/><rect x={x} y={y + height * .66} width={width} height={Math.max(2,height * .02)} fill="#00f7ff"/></g>;
  return null;
}

function LocalWarpLayer({ canvasWidth, canvasHeight, warp, onSelect }) {
  const cellWidth = canvasWidth / warp.columns;
  const cellHeight = canvasHeight / warp.rows;
  const cells = Array.from({ length: warp.columns * warp.rows }, (_, index) => index);
  return <>
    <defs>{cells.map(index=>{
      const column = index % warp.columns;
      const row = Math.floor(index / warp.columns);
      const cell = warp.cells[index] || DEFAULT_CELL;
      return <React.Fragment key={index}><clipPath id={`warp-clip-${index}`}><rect x={column * cellWidth} y={row * cellHeight} width={cellWidth + .5} height={cellHeight + .5}/></clipPath><EffectDefinitions index={index} cell={cell}/></React.Fragment>;
    })}</defs>
    <g className="local-warp-layer">{cells.map(index=>{
      const column = index % warp.columns;
      const row = Math.floor(index / warp.columns);
      const cell = warp.cells[index] || DEFAULT_CELL;
      const centerX = (column + .5) * cellWidth;
      const centerY = (row + .5) * cellHeight;
      const transform = `translate(${centerX + cell.x} ${centerY + cell.y}) skewX(${cell.skew}) scale(${cell.scaleX / 100} ${cell.scaleY / 100}) translate(${-centerX} ${-centerY})`;
      const filtered = cell.effect !== 'none' || cell.blur > 0;
      return <g key={index} clipPath={`url(#warp-clip-${index})`}><g transform={transform} filter={filtered ? `url(#tech-filter-${index})` : undefined}><use href="#source-master"/></g><CellEffectOverlay index={index} cell={cell} x={column * cellWidth} y={row * cellHeight} width={cellWidth} height={cellHeight}/></g>;
    })}</g>
    <g className="editor-only warp-selectors">{cells.map(index=>{
      const column = index % warp.columns;
      const row = Math.floor(index / warp.columns);
      return <rect key={index} x={column * cellWidth} y={row * cellHeight} width={cellWidth} height={cellHeight} className={index === warp.selected ? 'selected' : ''} onPointerDown={event=>{event.stopPropagation();onSelect(index)}}/>;
    })}</g>
  </>;
}

function PosterTypography({ canvasWidth, canvasHeight, typography, colors, safeMargin }) {
  const margin = Math.min(canvasWidth, canvasHeight) * safeMargin / 100;
  const titleSize = Math.min(canvasWidth, canvasHeight) * typography.titleSize / 1000;
  const subtitleSize = titleSize * .24;
  const infoSize = Math.max(12, titleSize * .18);
  const centered = typography.placement === 'top-center';
  const bottom = typography.placement === 'bottom-left';
  const x = centered ? canvasWidth / 2 : margin;
  const anchor = centered ? 'middle' : 'start';
  const titleY = bottom ? canvasHeight - margin - titleSize * 1.65 : margin + titleSize;
  const subtitleY = titleY + titleSize * .46;
  const infoLines = typography.info.split('\n').slice(0, 4);
  const infoY = bottom ? margin + infoSize : canvasHeight - margin - infoSize * Math.max(0, infoLines.length - 1);
  return <g className="poster-typography" fill={colors.posterText} fontFamily={`${typography.fontFamily}, "Noto Sans SC", sans-serif`}>
    <text x={x} y={titleY} textAnchor={anchor} fontSize={titleSize} fontWeight="800" letterSpacing={-titleSize * .035}>{typography.title}</text>
    <text x={x} y={subtitleY} textAnchor={anchor} fontSize={subtitleSize} fontWeight="600" letterSpacing={subtitleSize * .05}>{typography.subtitle}</text>
    <text x={margin} y={infoY} fontSize={infoSize} fontWeight="500">{infoLines.map((line,index)=><tspan key={index} x={margin} dy={index === 0 ? 0 : infoSize * 1.35}>{line}</tspan>)}</text>
  </g>;
}

function CanvasArt({ phase, settings, source, toggles, contourText, colors, tileShape, hollow, canvasWidth, canvasHeight, layout, setLayout, warp, setWarp, typography }) {
  const analysis = useContourAnalysis(source, settings);
  const dragRef = useRef(null);
  const hasSource = Boolean(source?.url);
  const minimumSide = Math.min(canvasWidth, canvasHeight);
  const sourceWidth = source?.width || canvasWidth;
  const sourceHeight = source?.height || canvasHeight;
  const coverScale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight) * layout.imageScale / 100;
  const fittedWidth = sourceWidth * coverScale;
  const fittedHeight = sourceHeight * coverScale;
  const imageX = (canvasWidth - fittedWidth) / 2 + canvasWidth * layout.imageX / 100;
  const imageY = (canvasHeight - fittedHeight) / 2 + canvasHeight * layout.imageY / 100;
  const words = (contourText || 'FORM FOLLOWS FEELING').toUpperCase();
  const edgeElements = useMemo(() => {
    if (!analysis?.edge.length) return [];
    const targetCount = Math.max(40, Math.round(60 + settings.density * 3.2));
    const step = Math.max(1, Math.ceil(analysis.edge.length / targetCount));
    return analysis.edge.filter((_, index)=>index % step === 0).map((point,index)=>({
      x: imageX + point.x * fittedWidth / analysis.width,
      y: imageY + point.y * fittedHeight / analysis.height,
      inner: point.inner,
      size: Math.max(1.5, minimumSide * (settings.size / 1000) * (.55 + (index % 5) * .12)),
      rotation: (index * 29) % 180,
    }));
  }, [analysis, fittedWidth, fittedHeight, imageX, imageY, minimumSide, settings.density, settings.size]);
  const scatter = phase === 2 ? 1 + settings.spread / 260 : phase === 3 ? 1.02 : phase === 1 ? .99 : 1;
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const handlePointerDown = event => {
    if (!hasSource || warp.enabled) return;
    dragRef.current = { clientX:event.clientX,clientY:event.clientY,imageX:layout.imageX,imageY:layout.imageY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = event => {
    if (!dragRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setLayout(current=>({...current,imageX:dragRef.current.imageX + (event.clientX - dragRef.current.clientX) / bounds.width * 100,imageY:dragRef.current.imageY + (event.clientY - dragRef.current.clientY) / bounds.height * 100}));
  };
  const stopDrag = () => { dragRef.current = null; };
  const guideColumns = warp.enabled ? warp.columns : 6;
  const guideRows = warp.enabled ? warp.rows : 8;
  const safe = minimumSide * layout.safeMargin / 100;
  return <svg id="artboard" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} data-width={canvasWidth} data-height={canvasHeight} role="img" aria-label="海报编辑画布" onPointerMove={handlePointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
    <rect className="canvas-background" width={canvasWidth} height={canvasHeight} fill={colors.background}/>
    <defs>
      {hasSource ? <image id="source-master" href={source.url} x={imageX} y={imageY} width={fittedWidth} height={fittedHeight} preserveAspectRatio="none"/> : null}
      <filter id="rounded-contour" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation={Math.max(.4, minimumSide * .004 * PHASES[phase].radius / 100)}/><feComponentTransfer><feFuncA type="table" tableValues="0 0 1 1"/></feComponentTransfer></filter>
      <filter id="colorize-contour" colorInterpolationFilters="sRGB"><feFlood floodColor={colors.subject}/><feComposite in2="SourceAlpha" operator="in"/></filter>
    </defs>
    {hasSource && toggles.original ? warp.enabled ? <LocalWarpLayer canvasWidth={canvasWidth} canvasHeight={canvasHeight} warp={warp} onSelect={selected=>setWarp(current=>({...current,selected}))}/> : <use className="source-background" href="#source-master" onPointerDown={handlePointerDown} style={{cursor:'grab'}}/> : null}
    {hasSource && analysis && toggles.shape && phase !== 2 && phase !== 3 ? <image className="detected-mask" href={analysis.maskUrl} x={imageX} y={imageY} width={fittedWidth} height={fittedHeight} preserveAspectRatio="none" filter={phase === 1 ? 'url(#rounded-contour)' : 'url(#colorize-contour)'}/> : null}
    {!hasSource ? <g className="empty-poster" fill={colors.posterText} opacity=".72"><text x={centerX} y={centerY - 10} textAnchor="middle" fontSize={minimumSide * .03} fontWeight="700">导入图片开始制作海报</text><text x={centerX} y={centerY + 28} textAnchor="middle" fontSize={minimumSide * .014} opacity=".66">支持社交媒体与 A3 / A4 印刷尺寸</text></g> : null}
    {analysis ? <g className="particles">{edgeElements.map((point,index)=>{
      const enabled = point.inner ? toggles.innerText : toggles.text;
      if (!enabled && phase !== 2 && phase !== 3) return null;
      const looseX = phase === 2 ? Math.sin(index * 2.7) * point.size * settings.spread / 35 : 0;
      const looseY = phase === 2 ? Math.cos(index * 1.9) * point.size * settings.spread / 35 : 0;
      return <g key={`${point.x}-${point.y}`} data-contour={point.inner ? 'inner' : 'outer'} transform={`translate(${centerX + (point.x - centerX) * scatter + looseX} ${centerY + (point.y - centerY) * scatter + looseY}) rotate(${point.rotation})`}>{enabled ? <ContourTile shape={tileShape} hollow={hollow} size={point.size} radius={phase === 1 ? point.size * .45 : PHASES[phase].radius * point.size / 130} colors={colors} strokeWidth={Math.max(.65,minimumSide * .0011)} character={words[index % words.length] || 'A'} rotation={point.rotation}/> : phase === 3 ? <rect x={-point.size} y={-point.size} width={point.size * 2} height={point.size * 2} fill="none" stroke={colors.tile}/> : <circle r={point.size * .62} fill={colors.tile}/>}</g>;
    })}</g> : null}
    {hasSource ? <PosterTypography canvasWidth={canvasWidth} canvasHeight={canvasHeight} typography={typography} colors={colors} safeMargin={layout.safeMargin}/> : null}
    <g className="editor-only guides" pointerEvents="none">
      {layout.showGrid ? <>{Array.from({length:guideColumns - 1},(_,index)=><line key={`v${index}`} x1={(index + 1) * canvasWidth / guideColumns} y1="0" x2={(index + 1) * canvasWidth / guideColumns} y2={canvasHeight}/>)}{Array.from({length:guideRows - 1},(_,index)=><line key={`h${index}`} x1="0" y1={(index + 1) * canvasHeight / guideRows} x2={canvasWidth} y2={(index + 1) * canvasHeight / guideRows}/>)}</> : null}
      {layout.showSafe ? <rect className="safe-guide" x={safe} y={safe} width={canvasWidth - safe * 2} height={canvasHeight - safe * 2}/> : null}
    </g>
  </svg>;
}

function App() {
  const imageInputRef = useRef(null);
  const fontInputRef = useRef(null);
  const [sources,setSources] = useState([]);
  const [selected,setSelected] = useState(null);
  const [templateId,setTemplateId] = useState('editorial');
  const [phase,setPhase] = useState(0);
  const [contourText,setContourText] = useState('FORM FOLLOWS FEELING');
  const [tileShape,setTileShape] = useState('square');
  const [hollow,setHollow] = useState(false);
  const [canvasPreset,setCanvasPreset] = useState('social');
  const [zoom,setZoom] = useState(100);
  const [format,setFormat] = useState('PNG');
  const [exportScale,setExportScale] = useState(1);
  const [transparent,setTransparent] = useState(false);
  const [toast,setToast] = useState('');
  const [customFontName,setCustomFontName] = useState('');
  const [toggles,setToggles] = useState({original:true,shape:false,text:true,innerText:true});
  const [colors,setColors] = useState(TEMPLATES[0].colors);
  const [settings,setSettings] = useState({threshold:155,smooth:2,area:28,invert:false,size:22,spread:22,density:58});
  const [layout,setLayout] = useState({imageScale:100,imageX:0,imageY:0,showGrid:true,showSafe:true,safeMargin:5});
  const [warp,setWarp] = useState({enabled:false,columns:6,rows:8,selected:0,cells:{}});
  const [typography,setTypography] = useState({...TEMPLATES[0].typography,fontFamily:'Noto Sans SC'});
  const activeSource = sources.find(source=>source.id === selected);
  const selectedPreset = CANVAS_PRESETS.find(item=>item.value === canvasPreset);
  const canvasSize = selectedPreset?.width ? {width:selectedPreset.width,height:selectedPreset.height} : {width:activeSource?.width || DEFAULT_CANVAS.width,height:activeSource?.height || DEFAULT_CANVAS.height};

  const showToast = message => {
    setToast(message);
    window.setTimeout(()=>setToast(''),2200);
  };
  const importImages = async event => {
    const files = Array.from(event.target.files || []).slice(0,Math.max(0,5 - sources.length));
    if (!files.length) return;
    try {
      const next = await Promise.all(files.map(async (file,index)=>{
        const url = await fileToDataUrl(file);
        const dimensions = await imageDimensions(url);
        return {id:Date.now() + index,name:file.name.replace(/\.[^.]+$/,''),url,...dimensions};
      }));
      setSources(current=>[...current,...next]);
      setSelected(next[0].id);
      setLayout(current=>({...current,imageScale:100,imageX:0,imageY:0}));
      showToast(`已导入 ${next.length} 张图片`);
    } catch {
      showToast('图片读取失败，请更换文件');
    }
    event.target.value = '';
  };
  const removeSource = id => setSources(current=>{
    const next = current.filter(source=>source.id !== id);
    if (selected === id) setSelected(next[0]?.id ?? null);
    return next;
  });
  const applyTemplate = template => {
    setTemplateId(template.id);
    setColors(template.colors);
    setTileShape(template.tileShape);
    setHollow(template.hollow);
    setPhase(template.phase);
    setTypography(current=>({...current,...template.typography}));
    setWarp(current=>({...current,...template.warp,cells:{},selected:0}));
  };
  const uploadFont = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const family = `PosterFont-${Date.now()}`;
      const font = new FontFace(family,await file.arrayBuffer());
      await font.load();
      document.fonts.add(font);
      setCustomFontName(family);
      setTypography(current=>({...current,fontFamily:family}));
      showToast(`字体 ${file.name} 已载入`);
    } catch {
      showToast('字体载入失败');
    }
    event.target.value = '';
  };
  const exportPoster = () => {
    const svg = document.getElementById('artboard');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('.editor-only').forEach(element=>element.remove());
    if (transparent) clone.querySelector('.canvas-background')?.setAttribute('fill','none');
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    const serialized = new XMLSerializer().serializeToString(clone);
    if (format === 'SVG') {
      const url = URL.createObjectURL(new Blob([serialized],{type:'image/svg+xml'}));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `轮廓文字-${canvasSize.width}x${canvasSize.height}.svg`;
      anchor.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      showToast('SVG 海报已导出');
      return;
    }
    showToast('正在生成高清海报…');
    const image = new Image();
    const svgUrl = URL.createObjectURL(new Blob([serialized],{type:'image/svg+xml'}));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize.width * exportScale;
      canvas.height = canvasSize.height * exportScale;
      const context = canvas.getContext('2d');
      context.scale(exportScale,exportScale);
      context.drawImage(image,0,0,canvasSize.width,canvasSize.height);
      canvas.toBlob(blob=>{
        if (!blob) {
          showToast('导出失败，请重试');
          return;
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `轮廓文字-${canvasSize.width * exportScale}x${canvasSize.height * exportScale}.png`;
        anchor.click();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
        showToast('PNG 海报已导出');
      },'image/png');
      URL.revokeObjectURL(svgUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      showToast('导出失败，请重试');
    };
    image.src = svgUrl;
  };

  return <div className="app-shell">
    <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={importImages}/>
    <input ref={fontInputRef} type="file" accept=".ttf,.otf,font/ttf,font/otf" hidden onChange={uploadFont}/>
    <Topbar onImport={()=>imageInputRef.current?.click()} onExport={exportPoster} format={format} setFormat={setFormat} exportScale={exportScale} setExportScale={setExportScale}/>
    <aside className="control-sidebar">
      <SourceSection sources={sources} selected={selected} onSelect={setSelected} onImport={()=>imageInputRef.current?.click()} onRemove={removeSource} layout={layout} setLayout={setLayout}/>
      <LayoutSection templateId={templateId} onApplyTemplate={applyTemplate} layout={layout} setLayout={setLayout} warp={warp} setWarp={setWarp}/>
      <ContourSection contourText={contourText} setContourText={setContourText} settings={settings} setSettings={setSettings} toggles={toggles} setToggles={setToggles} phase={phase} setPhase={setPhase} tileShape={tileShape} setTileShape={setTileShape} hollow={hollow} setHollow={setHollow} colors={colors} setColors={setColors}/>
      <TypographySection typography={typography} setTypography={setTypography} onUploadFont={()=>fontInputRef.current?.click()} customFontName={customFontName} colors={colors} setColors={setColors}/>
      <section className="inspector-section export-options"><div className="section-body"><label className="color-field"><span>画布背景</span><input type="color" value={colors.background} onChange={event=>setColors(current=>({...current,background:event.target.value}))}/><code>{colors.background}</code></label><Toggle label="透明底色" checked={transparent} onChange={setTransparent}/></div></section>
    </aside>
    <main className="workspace">
      <div className="canvas-toolbar">
        <strong>海报画布</strong>
        <label><span>尺寸</span><select aria-label="画布尺寸" value={canvasPreset} onChange={event=>{setCanvasPreset(event.target.value);setZoom(100)}}>{CANVAS_PRESETS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <button className={layout.showGrid ? 'active' : ''} title="网格参考线" onClick={()=>setLayout(current=>({...current,showGrid:!current.showGrid}))}><Icon name="grid"/></button>
        <button className={layout.showSafe ? 'active' : ''} title="安全边距" onClick={()=>setLayout(current=>({...current,showSafe:!current.showSafe}))}><Icon name="frame"/></button>
        <span>{canvasSize.width} × {canvasSize.height}</span>
        <button onClick={()=>setZoom(value=>Math.max(30,value - 8))}><Icon name="minus"/></button><output>{zoom}%</output><button onClick={()=>setZoom(value=>Math.min(130,value + 8))}><Icon name="plus"/></button>
      </div>
      <div className="canvas-viewport"><div className="canvas-sheet" style={{transform:`scale(${zoom / 100})`,aspectRatio:`${canvasSize.width}/${canvasSize.height}`}}><CanvasArt phase={phase} settings={settings} source={activeSource} toggles={toggles} contourText={contourText} colors={colors} tileShape={tileShape} hollow={hollow} canvasWidth={canvasSize.width} canvasHeight={canvasSize.height} layout={layout} setLayout={setLayout} warp={warp} setWarp={setWarp} typography={typography}/></div></div>
    </main>
    {toast ? <div className="toast">{toast}</div> : null}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
