import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BellRinging, Broadcast, Check, PaperPlaneTilt, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Button, Callout, PageHeader, Skeleton } from '../components/ui';

interface SetupState {
  quickStart: { hasChannel: boolean; hasSource: boolean; hasRoute: boolean; setupComplete: boolean };
}

export function OnboardingPage({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [state, setState] = useState<SetupState>();
  const load = () => api<SetupState>('/api/dashboard').then(setState).catch((error) => toast.error(error.message));
  useEffect(() => { void load(); }, []);
  const finish = async () => {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ setupComplete: true }) }); toast.success('基础配置完成'); onDone(); navigate('/');
  };
  if (!state) return <div><PageHeader title="开始配置" /><Skeleton lines={6} /></div>;
  const steps = [
    { done: state.quickStart.hasChannel, icon: PaperPlaneTilt, title: '添加通知出口', description: '先决定消息发到哪里。群机器人和 Bark 的配置最简单。', to: '/channels', action: '配置出口' },
    { done: state.quickStart.hasSource, icon: Broadcast, title: '接入应用或设备', description: 'Lucky 等应用复制 Webhook；绿联 NAS 只需填写管理地址和本地账号。', to: '/sources', action: '添加入口' },
    { done: state.quickStart.hasRoute, icon: ShieldCheck, title: '确认主备顺序', description: '需要补位时，把企微应用排第一、群机器人排第二。', to: '/sources', action: '检查路由' },
  ];
  const complete = steps.every((step) => step.done);
  return <div className="onboarding-page">
    <PageHeader title="欢迎使用 EasyNotice" description="不用一次理解所有概念。按这三个动作完成第一条通知。" />
    <div className="onboarding-intro"><span><BellRinging size={30} weight="fill" /></span><div><h2>先跑通，再细调</h2><p>建议先用一个群机器人或 Bark 收到测试预览，然后再添加企微应用、图片规则和更多应用或设备。</p></div></div>
    <div className="onboarding-steps section-block">{steps.map((step, index) => { const Icon = step.icon; return <article className={`onboarding-step ${step.done ? 'is-done' : ''}`} key={step.title}><div className="onboarding-step__number">{step.done ? <Check size={20} weight="bold" /> : index + 1}</div><span className="onboarding-step__icon"><Icon size={25} weight="duotone" /></span><div><h2>{step.title}</h2><p>{step.description}</p></div><Link to={step.to}><Button variant={step.done ? 'quiet' : 'secondary'}>{step.done ? '查看' : step.action}<ArrowRight size={16} /></Button></Link></article>; })}</div>
    {complete ? <Callout tone="success" title="基础通知链路已经连通">你现在可以结束向导。之后仍可从左侧导航随时增加入口和出口。</Callout> : <Callout>每完成一项后回到这里，状态会自动更新。也可以暂时结束，稍后继续配置。</Callout>}
    <div className="onboarding-actions"><Button variant="secondary" onClick={finish}>{complete ? '完成向导' : '暂时结束向导'}<ArrowRight size={16} /></Button></div>
  </div>;
}
