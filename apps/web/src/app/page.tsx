import { LocalPracticeEntryLink } from '@/components/local-practice-entry-link';
import { SiteNavigation } from '@/components/site-navigation';
import { ArrowUpRight, Braces, Check, Compass, GraduationCap } from 'lucide-react';

export default function Home() {
  return <main className="home-page">
    <div className="home-container"><SiteNavigation currentPath="/" />
      <section className="home-hero">
        <div><p className="home-eyebrow"><span /> A little practice. A clearer way to think.</p>
          <h1>Good code starts<br />with a <em>clear idea.</em></h1>
          <p className="home-description">Build your problem-solving skills one step at a time. Think through the approach, get useful feedback, then bring your solution to life in code.</p>
          <div className="home-actions"><LocalPracticeEntryLink className="button">Start a practice session <ArrowUpRight size={17} /></LocalPracticeEntryLink><a href="/roadmap">Explore the roadmap <span aria-hidden="true">→</span></a></div>
          <p className="home-meta">Start as a guest · Python 3, C++20 & TypeScript</p>
        </div>
        <aside className="home-preview" aria-label="How practice works"><div className="home-preview-bar"><span className="home-preview-dot" /> YOUR NEXT BREAKTHROUGH <Braces size={18}/></div>
          <div className="home-preview-body"><span className="home-tag">Algorithms · Foundation</span><h2>A pair. A target.<br />A better approach.</h2><p>Find two numbers that add up to a target. How would you avoid checking every pair?</p>
            <div className="home-example"><span>01</span><code>Remember the numbers you have seen.</code><span>02</span><code>Look for the missing complement.</code><span>03</span><code>Return the matching pair.</code></div>
            <div className="home-preview-result"><span><Check size={16}/></span><div><strong>Make your reasoning visible.</strong><p>Then turn your plan into working code.</p></div></div>
          </div>
        </aside>
      </section>
      <section className="home-paths" aria-label="Choose your learning path"><div className="home-path-heading"><p className="eyebrow">YOUR NEXT STEP</p><h2>Find your way into practice.</h2></div><div className="home-path-grid">
        {[{href:'/roadmap',icon:Compass,title:'Follow a roadmap',text:'Build from foundations to advanced algorithms and system design.',tag:'Explore by topic'},{href:'/onboarding',icon:Braces,title:'Make it personal',text:'Set your goals and get a learning plan that fits your experience.',tag:'Build your plan'},{href:'/classes',icon:GraduationCap,title:'Learn with your class',text:'Join with an instructor’s code and keep your assignments in one place.',tag:'Find your class'}].map(({href,icon:Icon,title,text,tag})=><a className="home-path-card" href={href} key={href}><Icon size={22} strokeWidth={1.6}/><h3>{title}</h3><p>{text}</p><span>{tag}<ArrowUpRight size={16}/></span></a>)}
      </div></section><footer className="home-footer"><span>Method — Think before syntax.</span><a href="/requests">Help shape Method ↗</a></footer>
    </div>
  </main>;
}
