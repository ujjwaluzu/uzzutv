/* =========================================================
   HERO SLIDER
========================================================= */

window.addEventListener("DOMContentLoaded",function(){
azBuildHeroDots();
updateAuthNavbar().catch(function(e){
console.error("Auth navbar error:", e);
});
var l=document.getElementById("az-loader");
if(l){l.classList.add("fade-out");setTimeout(function(){l.style.display="none"},1000);}
});
document.addEventListener("keydown",function(e){
if(e.key==="ArrowLeft"){azHeroMove(-1)}
else if(e.key==="ArrowRight"){azHeroMove(1)}
});
function azBuildHeroDots(){
var c=document.getElementById("az-hero-dots");
var s=document.querySelectorAll(".az-hero-slide");
if(!c||s.length===0)return;
c.innerHTML="";
s.forEach(function(_,i){
var d=document.createElement("button");
d.type="button";d.className="hero-dot";
d.setAttribute("aria-label","Go to slide "+(i+1));
if(i===0)d.classList.add("active");
d.addEventListener("click",function(){azGoToSlide(i)});
c.appendChild(d);
});
}
var azIdx=0;
var azSlides=document.querySelectorAll(".az-hero-slide");
function azActivateSlide(i){
azSlides.forEach(function(s){s.classList.remove("active")});
azSlides[i].classList.add("active");
var dots=document.querySelectorAll(".hero-dot");
dots.forEach(function(d,di){d.classList.toggle("active",di===i)});
}
function azGoToSlide(i){azIdx=i;azActivateSlide(i)}
function azHeroMove(dir){
if(azSlides.length===0)return;
azIdx=(azIdx+dir+azSlides.length)%azSlides.length;
azActivateSlide(azIdx);
}
function azShowSlide(){
if(azSlides.length===0)return;
azIdx=(azIdx+1)%azSlides.length;
azActivateSlide(azIdx);
}
var azTimer;
if(azSlides.length>0){azSlides[0].classList.add("active");azTimer=setInterval(azShowSlide,6000)}
var azWrapper=document.querySelector(".az-hero-wrapper");
if(azWrapper){
azWrapper.addEventListener("mouseenter",function(){clearInterval(azTimer)});
azWrapper.addEventListener("mouseleave",function(){azTimer=setInterval(azShowSlide,6000)});
}

/* =========================================================
   SLIDER SCROLL UTILS
========================================================= */

function azSlideLeft(id){var s=document.getElementById(id);if(s)s.scrollBy({left:-600,behavior:"smooth"})}
function azSlideRight(id){var s=document.getElementById(id);if(s)s.scrollBy({left:600,behavior:"smooth"})}

/* =========================================================
   TOGGLE DESCRIPTION
   ========================================================= */

function azToggleDesc(){
var t=document.getElementById("az-desc-text");
var b=document.getElementById("az-desc-toggle");
if(!t||!b)return;
if(t.classList.contains("collapsed")){t.classList.remove("collapsed");b.innerHTML='Show Less <span class="material-icons" style="font-size:18px;">expand_less</span>';b.setAttribute("aria-expanded","true");}
else{t.classList.add("collapsed");b.innerHTML='Show More <span class="material-icons" style="font-size:18px;">expand_more</span>';b.setAttribute("aria-expanded","false");}
}

/* =========================================================
   DETAIL PAGE WATCHLIST BUTTON
========================================================= */

document.addEventListener("DOMContentLoaded",function(){
var wlBtn=document.querySelector(".az-watchlist-btn");
if(wlBtn){
wlBtn.addEventListener("click",function(){
toggleAniuzuWatchlist(wlBtn.dataset.id,wlBtn.dataset.title,wlBtn.dataset.poster,wlBtn);
});
updateAniuzuWatchlistButton(wlBtn.dataset.id,wlBtn).catch(function(e){console.error("Watchlist button init error:",e);});
}
});

/* =========================================================
   SCORE COLORING
========================================================= */

document.addEventListener("DOMContentLoaded",function(){
document.querySelectorAll(".card-rating").forEach(function(el){
var m=el.textContent.match(/(\d+)/);
if(m){var n=parseInt(m[1]);if(n>=80)el.classList.add("score-high");else if(n>=60)el.classList.add("score-mid");else el.classList.add("score-low")}
});
document.querySelectorAll(".az-hero-rating").forEach(function(el){
var raw=el.getAttribute("data-score");
var n=raw?parseInt(raw):null;
if(n===null){var m=el.textContent.match(/(\d+)/);if(m)n=parseInt(m[1]);}
if(n!==null){if(n>=80)el.classList.add("score-high");else if(n>=60)el.classList.add("score-mid");else el.classList.add("score-low")}
});
document.querySelectorAll(".az-card").forEach(function(card){
var link=card.querySelector(".card-link");
if(!link)return;
var href=link.getAttribute("href")||"";
var m=href.match(/\/anime\/(\d+)\//);
if(!m)return;
var id=m[1];
var img=card.querySelector(".card-poster img");
var title=card.querySelector(".card-title");
var poster=img?img.src:"";
var t=title?title.textContent.trim():"";
var btn=document.createElement("button");
btn.className="az-card-watchlist";
btn.innerHTML="&#65291;";
btn.setAttribute("data-id",id);
btn.setAttribute("data-type","anime");
btn.setAttribute("data-title",t);
btn.setAttribute("data-poster",poster);
btn.setAttribute("aria-label","Add to Watchlist");
btn.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();toggleAniuzuWatchlist(id,t,poster,btn)});
card.appendChild(btn);
card._azWatchId=id;
card._azWatchBtn=btn;
});
if(typeof getAniuzuWatchlistIds==="function"){
var allIds=[];
document.querySelectorAll(".az-card[data-id],.az-card").forEach(function(card){if(card._azWatchId)allIds.push(card._azWatchId)});
if(allIds.length>0){
getAniuzuWatchlistIds(allIds).then(function(inWatchlist){
document.querySelectorAll(".az-card").forEach(function(card){
var id=card._azWatchId;var btn=card._azWatchBtn;
if(!id||!btn)return;
if(inWatchlist[id]){btn.innerHTML="&#10003;";btn.classList.add("in-watchlist")}
});
});
}
}
var btt=document.getElementById("az-back-to-top");
if(btt){window.addEventListener("scroll",function(){btt.classList.toggle("visible",window.scrollY>400)});btt.addEventListener("click",function(){window.scrollTo({top:0,behavior:"smooth"})})}
});
