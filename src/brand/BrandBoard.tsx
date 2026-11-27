/* Dev-only brand board (served by `vite` at /brand-board.html; not part of the production build input). */
import { createRoot } from 'react-dom/client'
import '../index.css'
import './tokens.css'
import { BRAND, FzLoader, FzLogo, FzMark, FzWordmark } from './Logo'
import { ICONS } from './icons'

const PALETTE: [string, string, string][] = [
  ['Midnight Navy', '#101426', 'Background'], ['Deep Purple', '#6D4AFF', 'Primary'], ['Electric Cyan', '#20D5D2', 'Secondary'],
  ['Neon Blue', '#3887FF', 'Info / links'], ['Soft White', '#F5F5FA', 'Text'], ['Secondary Gray', '#A5A9BB', 'Muted text'], ['Accent Gold', '#E5B85C', 'Rewards']
]
const MODES: [string, string, string, keyof typeof ICONS][] = [
  ['Story', 'قصص', 'var(--fz-mode-story)', 'story'], ['Detective', 'المحقق', 'var(--fz-mode-detective)', 'detective'],
  ['Bakasa', 'بكاسة', 'var(--fz-mode-bakasa)', 'bakasa'], ['Multiplayer', 'جماعي', 'var(--fz-mode-multiplayer)', 'multiplayer']
]
const H = ({ children }: { children: string }) => <h2 style={{ fontFamily: 'var(--fz-font-display)', fontWeight: 800, fontSize: 26, margin: '40px 0 16px', color: 'var(--fz-white)' }}>{children}</h2>
const card = { background: 'var(--fz-surface-1)', border: '1px solid var(--fz-line)', borderRadius: 'var(--fz-radius-lg)', padding: 20 } as const

function Board() {
  return (
    <main style={{ fontFamily: 'var(--fz-font-text)', color: 'var(--fz-white)', background: 'var(--fz-navy)', minHeight: '100vh', padding: '40px 48px', maxWidth: 1280, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <FzLogo size={72} tagline />
        <FzLogo size={72} tagline lang="ar" />
      </header>

      <H>Logo system</H>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div style={{ ...card, display: 'grid', placeItems: 'center', gap: 12 }}><FzMark size={140} /><small style={{ color: 'var(--fz-gray)' }}>App icon / monogram</small></div>
        <div style={{ ...card, display: 'grid', placeItems: 'center', gap: 12 }}><FzMark size={140} tile={false} /><small style={{ color: 'var(--fz-gray)' }}>Mark on dark</small></div>
        <div style={{ ...card, background: '#F5F5FA', display: 'grid', placeItems: 'center', gap: 12 }}><FzMark size={140} /><small style={{ color: '#4b5068' }}>On light</small></div>
        <div style={{ ...card, display: 'flex', alignItems: 'end', justifyContent: 'center', gap: 18 }}>{[64, 48, 32, 24, 16].map((s) => <FzMark key={s} size={s} />)}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={{ ...card, display: 'grid', placeItems: 'center' }}><FzWordmark size={44} /></div>
        <div style={{ ...card, display: 'grid', placeItems: 'center' }}><FzWordmark lang="ar" size={48} /></div>
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}><FzLoader size={84} /><span style={{ color: 'var(--fz-gray)' }}>Loading animation</span></div>
      </div>

      <H>Colour</H>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
        {PALETTE.map(([n, hex, role]) => (
          <div key={hex} style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ background: hex, height: 84, borderBottom: '1px solid var(--fz-line)' }} />
            <div style={{ padding: 12 }}><b style={{ fontSize: 13 }}>{n}</b><div style={{ fontSize: 12, color: 'var(--fz-gray)' }}>{hex} · {role}</div></div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
        {['--fz-grad-brand', '--fz-grad-zone', '--fz-grad-gold'].map((g) => <div key={g} style={{ height: 56, borderRadius: 'var(--fz-radius-md)', background: `var(${g})`, display: 'grid', placeItems: 'center', fontSize: 12, color: '#101426', fontWeight: 700 }}>{g}</div>)}
      </div>

      <H>Typography</H>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ fontFamily: 'var(--fz-font-display)', fontWeight: 800, fontSize: 44, lineHeight: 1.1 }}>Play together.</div>
          <div style={{ fontFamily: 'var(--fz-font-display)', fontWeight: 600, fontSize: 24, marginTop: 6 }}>Display · FZ Display (Baloo Bhaijaan 2)</div>
          <p style={{ color: 'var(--fz-gray)', marginTop: 10 }}>Body · FZ Text (Cairo). Clear at every size, built for long readable game text and buttons.</p>
        </div>
        <div style={card} dir="rtl">
          <div style={{ fontFamily: 'var(--fz-font-display)', fontWeight: 800, fontSize: 44, lineHeight: 1.2 }}>العبوا مع بعض.</div>
          <div style={{ fontFamily: 'var(--fz-font-display)', fontWeight: 600, fontSize: 24, marginTop: 6 }}>العناوين · نفس الخط بالعربي والإنجليزي</div>
          <p style={{ color: 'var(--fz-gray)', marginTop: 10 }}>النصوص · خط القاهرة. واضح وسهل القراءة في الأسئلة والكروت والأزرار.</p>
        </div>
      </div>

      <H>Game modes</H>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {MODES.map(([en, ar, c, icon]) => { const I = ICONS[icon]; return (
          <div key={en} style={{ ...card, borderColor: c, background: `linear-gradient(160deg, color-mix(in srgb, ${c} 22%, var(--fz-surface-1)), var(--fz-surface-1))` }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 48, height: 48, borderRadius: 14, background: c, color: '#101426' }}><I size={28} /></span>
            <div style={{ fontFamily: 'var(--fz-font-display)', fontWeight: 800, fontSize: 22, marginTop: 12 }}>{en}</div>
            <div style={{ color: 'var(--fz-gray)' }}>{ar}</div>
          </div>) })}
      </div>

      <H>Icons</H>
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 18 }}>
        {Object.entries(ICONS).map(([n, I]) => <div key={n} style={{ display: 'grid', placeItems: 'center', gap: 6, color: 'var(--fz-white)' }}><I size={28} /><small style={{ fontSize: 10, color: 'var(--fz-gray)' }}>{n}</small></div>)}
      </div>

      <H>Components preview</H>
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
        <button style={{ background: 'var(--fz-grad-brand)', color: '#fff', border: 0, borderRadius: 'var(--fz-radius-pill)', padding: '12px 22px', fontWeight: 700, boxShadow: 'var(--fz-shadow-glow)', display: 'inline-flex', gap: 8, alignItems: 'center' }}><ICONS.play size={18} />Quick Play</button>
        <button style={{ background: 'var(--fz-surface-2)', color: 'var(--fz-white)', border: '1px solid var(--fz-line-strong)', borderRadius: 'var(--fz-radius-pill)', padding: '12px 22px', fontWeight: 700, display: 'inline-flex', gap: 8, alignItems: 'center' }}><ICONS.plus size={18} />Create room</button>
        <button style={{ background: 'transparent', color: 'var(--fz-cyan)', border: '2px solid var(--fz-cyan)', borderRadius: 'var(--fz-radius-pill)', padding: '10px 20px', fontWeight: 700, display: 'inline-flex', gap: 8, alignItems: 'center' }}><ICONS.join size={18} />Join with code</button>
        <span style={{ background: 'color-mix(in srgb, var(--fz-success) 20%, transparent)', color: 'var(--fz-success)', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>● Ready</span>
        <span style={{ background: 'color-mix(in srgb, var(--fz-gold) 22%, transparent)', color: 'var(--fz-gold)', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 700, display: 'inline-flex', gap: 6, alignItems: 'center' }}><ICONS.star size={14} />+10</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--fz-surface-2)', borderRadius: 999, padding: '6px 14px 6px 6px' }}>
          <span style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--fz-purple)', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 3px var(--fz-cyan)' }}><ICONS.voice size={16} /></span><small>Mahmoud · speaking</small></span>
        <input placeholder="Room code · كود الغرفة" style={{ background: 'var(--fz-surface-2)', color: 'var(--fz-white)', border: '1px solid var(--fz-line-strong)', borderRadius: 'var(--fz-radius-md)', padding: '12px 14px', minWidth: 220, outline: 'none', boxShadow: 'var(--fz-focus)' }} />
      </div>
      <p style={{ color: 'var(--fz-gray)', marginTop: 28, fontSize: 13 }}>{BRAND.tagline.en} · {BRAND.tagline.ar}</p>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Board />)
