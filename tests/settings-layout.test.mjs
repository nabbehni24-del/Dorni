import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('settings uses an unframed panel and its own consistent back header',()=>{
 const app=read('app/app/page.tsx');
 const center=read('components/owner-center.tsx');
 assert.ok(app.includes("p==='settings'?'settings-screen owner-panel'"));
 assert.ok(app.includes("p!=='settings'&&<Button"));
 assert.ok(center.includes('<SettingsHome onBack={onBack}'));
 assert.ok(center.includes("<SettingsHeader title={t(groups[group]"));
 assert.ok(!center.includes('className="owner-back"'));
});
test('appearance preview is isolated from application colors',()=>{
 const home=read('components/settings-home.tsx');
 assert.ok(home.includes('<section className="dorni-settings">'));
 assert.ok(home.includes('className="ds-preview" data-mode='));
 assert.ok(!home.includes('data-preview='));
 const css=read('components/settings-home.css');
 assert.ok(css.includes('.settings-screen .ds-label strong'));
 assert.ok(css.includes('.settings-screen .ds-label small'));
});
test('back controls are labeled and page changes reset reading position',()=>{
 const header=read('components/settings-header.tsx');
 assert.ok(header.includes("aria-label={text('رجوع','Back')}"));
 assert.ok(header.includes('window.scrollTo({top:0'));
 assert.ok(header.includes('focus({preventScroll:true})'));
});
