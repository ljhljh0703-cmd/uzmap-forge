import {it} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const css=readFileSync('web/play.css','utf8'),html=readFileSync('web/index.html','utf8');
it('the fitted field reserves a constant controls row rather than sizing it from selected content',()=>{assert.match(css,/grid-template-rows:\s*minmax\(0,1fr\) var\(--play-controls-height\)/);assert.match(css,/--play-controls-height:216px/);});
it('selected slot headings cannot disappear and PC detail cannot retain the old440px minimum',()=>{assert.doesNotMatch(css,/\.app\[data-selected=true\] \.round-heading\{display:none\}/);assert.doesNotMatch(css,/#gemPanel\{min-height:440px\}/);});
it('success notices are outside the battlefield input surface and precise placement uses an enclosing native label',()=>{const field=html.slice(html.indexOf('<div class="battlefield"'),html.indexOf('<section id="bottomPanel"'));assert.ok(!field.includes('id="actionFeedback"'));assert.match(html,/<label class="precise-placement"><input[^>]*id="precisePlacement"/);assert.match(css,/#menuPanelSettings>\.precise-placement\{[^}]*min-height:48px/);});
it('selection borders and numeric tutorial emphasis are contained inside their original target boxes',()=>{assert.match(css,/\.round-slot\[aria-pressed=true\]\{[^}]*outline-offset:-3px/);assert.match(css,/\.hud-pill>b\.tutorial-target\{[^}]*outline:none/);});

it('PC detail raster is anchored to its own body below the source commands',()=>{
 const match=css.match(/\.app\[data-simple-ui=true\] #gemPanel\[data-desktop-card=true\]\[data-selection-sheet=true\]>\.gem-meta>\.gem-detail-body\{([^}]+)\}/);
 assert.ok(match,'existing PC detail owner');
 assert.match(match[1],/position:relative(?:;|$)/,'an absolute raster must not use the entire selection card as its containing block');
 assert.match(match[1],/z-index:0/,'the scrolling body stays below the sticky disclosure summary');
 assert.match(match[1],/inset:auto/);assert.match(match[1],/max-height:none/);assert.match(match[1],/overflow:visible/);
 assert.match(css,/\.skin-framed\{[^}]*isolation:isolate/);assert.match(css,/\.skin-material\{[^}]*position:absolute/);
});
it('small-phone ability numbers precede the portrait inside the existing scrollable sheet',()=>{
 const rule=selector=>{const start=css.lastIndexOf(selector+'{');assert.ok(start>=0,selector);return css.slice(start+selector.length+1,css.indexOf('}',start));};
 const base='.app[data-simple-ui=true] #gemPanel[data-desktop-card=false][data-selection-sheet=true] .gem-detail-body';
 const order=body=>Number(body.match(/(?:^|;)order:(-?\d+)(?:;|$)/)?.[1]);
 assert.ok(order(rule(base+'>.gem-stats'))<order(rule(base+'>#selectedUnitArt')),'stats remain fully reachable before the large portrait on360px sheets');
 assert.match(rule(base),/overflow:auto/);assert.match(rule(base),/min-height:0/);
 assert.match(rule(base+'>.gem-stats'),/flex-shrink:0/);
 assert.match(css,/--play-controls-height:216px/,'field reservation unchanged');
});

it('the phone sheet sticky handle cancels the full framed top inset so no scroll gap remains',()=>{
 const rule=selector=>{const start=css.lastIndexOf(selector+'{');assert.ok(start>=0,selector);return css.slice(start+selector.length+1,css.indexOf('}',start));};
 const base='.app[data-simple-ui=true] #gemPanel[data-desktop-card=false][data-selection-sheet=true] .gem-detail-body';
 const framed=rule(base+'.skin-framed'),handle=rule(base+'>#selectionSheetHandle');
 const top=Number(framed.match(/padding-top:(\d+)px/)?.[1]),margin=Number(handle.match(/margin-top:(-?\d+)px/)?.[1]),sticky=Number(handle.match(/(?:^|;)top:(-?\d+)px/)?.[1]);
 assert.equal(top+margin,0,'the initial handle covers the entire inner top gap');assert.equal(top+sticky,0,'scrolling keeps the same opaque top boundary');
 assert.match(rule(base),/overflow:auto/);assert.match(css,/#selectionSheetHandle\{[^}]*min-height:44px/,'same44px swipe/collapse control');
});
