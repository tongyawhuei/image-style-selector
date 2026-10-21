const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const catalog=JSON.parse(fs.readFileSync(process.env.CATALOG_FILE||path.join(__dirname,'examples/catalog.json'),'utf8'));
const ids=catalog.map(d=>d.id),last=ids.at(-1),first=ids[0];
const card=id=>`#grid [data-id="${id}"]`;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'style-test-'));
 try{
 const page=await browser.newPage({offline:true,viewport:{width:1440,height:1100}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
 const site=path.resolve(process.env.STYLE_DIR||'dist');const url=pathToFileURL(path.join(site,'首页.html')).href;
 await page.goto(url+'?lang=zh');
 assert.equal(await page.locator('#grid article').count(),catalog.length);
 await page.evaluate(async()=>{for(const d of DATA){const im=new Image();im.src=d.image;await im.decode();if(im.naturalWidth!==1254||im.naturalHeight!==1254)throw Error('dimensions '+d.id)}});
 // Every reference keeps its Chinese text and original English generation prompt.
 for(const language of ['zh','en']){
  await page.locator('#language').selectOption(language);
  assert.equal(await page.locator('html').getAttribute('lang'),language==='zh'?'zh-CN':'en');
  for(const d of catalog){
   assert(d.en?.name&&d.en?.template,'translation '+d.id);
   assert.equal(await page.locator(`${card(d.id)} h3`).textContent(),language==='en'?d.en.name:d.name);
   await page.evaluate(id=>choose(id),d.id);
   assert.equal(await page.locator('#chosen').textContent(),(language==='en'?d.en.name+' · Prompt workbench':d.name+' · 提示词工作台'));
   const source=await page.locator('#original').textContent();assert(source.includes(d.original));
   const prompt=await page.locator('#output').inputValue();assert(prompt.includes('1:1'));assert(!prompt.includes(language==='en'?'[space]':'[要求]'));
   if(language==='en')assert(!/[\u3400-\u9fff]/.test(prompt),'English prompt '+d.id);
  }
  await page.locator('#q').fill(catalog.at(-1).name);assert.equal(await page.locator('#grid article').count(),1);await page.locator('#reset').click();
  await page.locator('#q').fill(catalog.at(-1).en.name);assert.equal(await page.locator('#grid article').count(),1);await page.locator('#reset').click();
  const group=catalog.at(-1).group;await page.locator('#group').selectOption(group);assert.equal(await page.locator('#grid article').count(),catalog.filter(d=>d.group===group).length);await page.locator('#reset').click();
  const use=catalog[0].uses.split('、')[0];await page.locator('#use').selectOption(use);assert.equal(await page.locator('#grid article').count(),catalog.filter(d=>d.uses.split('、').includes(use)).length);await page.locator('#reset').click();
 }
 // Language switching preserves filters, compared IDs, favorites and user input.
 for(const n of ids.slice(0,4))await page.locator(`${card(n)} [data-action="compare"]`).click();
 assert.equal(await page.locator('#compare article').count(),3);assert.match(await page.locator('#notice').textContent(),/up to 3/);
 await page.locator('#language').selectOption('zh');assert.match(await page.locator('#notice').textContent(),/最多/);
 await page.locator(`#compare [data-id="${ids[1]}"] [data-action="compare"]`).click();assert.equal(await page.locator('#compare article').count(),2);
 await page.locator(`${card(last)} [data-action="choose"]`).click();await page.locator('#subject').fill('测试 <scene> $& [比例]');await page.locator('#purpose').fill('My cover');await page.locator('#space').fill('Keep the right third empty');
 const chosenUse=catalog.at(-1).uses.split('、')[0];await page.locator('#group').selectOption(catalog.at(-1).group);await page.locator('#use').selectOption(chosenUse);
 await page.locator('#language').selectOption('en');assert.equal(await page.locator('#subject').inputValue(),'测试 <scene> $& [比例]');assert.equal(await page.locator('#purpose').inputValue(),'My cover');assert.equal(await page.locator('#space').inputValue(),'Keep the right third empty');assert.equal(await page.locator('#group').inputValue(),catalog.at(-1).group);assert.equal(await page.locator('#use').inputValue(),chosenUse);assert.equal(await page.locator('#compare article').count(),2);assert.match(await page.locator('#output').inputValue(),/测试 <scene> \$& \[比例\]/);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('test')}},configurable:true}));await page.locator('#copy').click();assert.match(await page.locator('#copyStatus').textContent(),/All text selected/);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async s=>window.copied=s},configurable:true}));await page.locator('#copy').click();assert(await page.evaluate(()=>window.copied===$('output').value));
 await page.locator(`${card(last)} [data-action="favorite"]`).click();
 const downloadEvent=page.waitForEvent('download');await page.locator('#export').click();const dl=await downloadEvent,dest=path.join(tmp,'favorites.json');await dl.saveAs(dest);assert.deepEqual(JSON.parse(fs.readFileSync(dest)).ids,[last]);assert.equal(dl.suggestedFilename(),'image-style-favorites.json');
 await page.locator('#language').selectOption('zh');await page.locator(`${card(last)} [data-action="favorite"]`).click();await page.locator('#import').setInputFiles(dest);await page.waitForFunction(()=>$('notice').textContent.includes('合并'));
 await page.locator('#language').selectOption('en');await page.goto(url);assert.equal(await page.locator('#language').inputValue(),'en');await page.locator('#favOnly').check();assert.equal(await page.locator('#grid article').count(),1);await page.locator('#reset').click();
 assert.equal(await page.locator('#subject').inputValue(),'');assert.equal(await page.locator('#space').inputValue(),'Moderate negative space');
 // Invalid imported IDs must be rejected in either language.
 const bad=path.join(tmp,'bad.json');fs.writeFileSync(bad,JSON.stringify({format:'image-style-public-favorites-v1',version:1,ids:[999999]}));await page.locator('#import').setInputFiles(bad);await page.waitForFunction(()=>$('notice').textContent.includes('Import failed'));
 await page.locator('#q').fill('unmatched-query');assert.equal(await page.locator('#grid article').count(),0);await page.locator('#reset').click();
 for(const language of ['zh','en']){
  await page.locator('#language').selectOption(language);
  for(const width of [1440,390]){await page.setViewportSize({width,height:1100});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'overflow '+language+width)}
  await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>window.scrollTo(0,0));
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'preview-'+language+'.png')});
  const guide=await page.locator('#guideLink').getAttribute('href');await page.goto(new URL(guide,url).href);assert.equal(await page.locator('#language').inputValue(),language);assert(await page.locator('#'+language).isVisible());assert.match(await page.locator('#home').getAttribute('href'),new RegExp('lang='+language));await page.goto(url+'?lang='+language);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log(JSON.stringify({passed:true,items:catalog.length,languages:['zh','en'],offline:true,errors,requests,checks:['30-images-and-templates-both-languages','bilingual-search','filters-preserved','compare-limit-and-localized-status','input-preserved','clipboard-success-fallback','cross-language-favorites','language-persistence','invalid-import','responsive-both-languages','offline-guide-both-languages']}));
 }finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
