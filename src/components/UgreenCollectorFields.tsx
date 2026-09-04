import { HardDrives, ShieldCheck } from '@phosphor-icons/react';
import { Callout, Field, Input, NativeSelect } from './ui';

export interface UgreenCollectorDraft {
  baseUrl: string;
  username: string;
  password: string;
  allowSelfSigned: boolean;
  intervalMinutes: number;
  importRecent: boolean;
}

export const emptyUgreenCollector: UgreenCollectorDraft = {
  baseUrl: '',
  username: '',
  password: '',
  allowSelfSigned: false,
  intervalMinutes: 5,
  importRecent: false,
};

interface Props {
  value: UgreenCollectorDraft;
  onChange: (value: UgreenCollectorDraft) => void;
  passwordOptional?: boolean;
  showImportRecent?: boolean;
}

export function UgreenCollectorFields({ value, onChange, passwordOptional = false, showImportRecent = false }: Props) {
  const set = <Key extends keyof UgreenCollectorDraft>(key: Key, next: UgreenCollectorDraft[Key]) => onChange({ ...value, [key]: next });
  return <fieldset className="field-group ugreen-fields">
    <legend><HardDrives size={17} />连接绿联 NAS</legend>
    <Callout title="这里不用填写 Webhook">EasyNotice 会主动读取绿联系统的消息中心。只需要填写你平时打开绿联管理后台使用的地址和本地账号。</Callout>
    <Field label="绿联管理地址" hint="只填写协议、IP 和端口，不要添加 /ugreen/... 路径" required>
      <Input type="url" value={value.baseUrl} onChange={(event) => set('baseUrl', event.target.value)} placeholder="http://192.168.1.20:9999" required />
    </Field>
    <div className="form-grid form-grid--2">
      <Field label="绿联用户名" hint="建议使用权限受控的本地账号" required>
        <Input value={value.username} onChange={(event) => set('username', event.target.value)} autoComplete="username" placeholder="NAS 登录用户名" required />
      </Field>
      <Field label="绿联密码" hint={passwordOptional ? '已加密保存；留空表示不修改' : '使用 EasyNotice 主密钥加密保存'} required={!passwordOptional}>
        <Input type="password" value={value.password} onChange={(event) => set('password', event.target.value)} autoComplete="new-password" placeholder={passwordOptional ? '留空保持原密码' : 'NAS 登录密码'} required={!passwordOptional} />
      </Field>
    </div>
    <Field label="检查间隔">
      <NativeSelect value={value.intervalMinutes} onChange={(event) => set('intervalMinutes', Number(event.target.value))}>
        <option value={1}>每 1 分钟</option>
        <option value={2}>每 2 分钟</option>
        <option value={5}>每 5 分钟（推荐）</option>
        <option value={10}>每 10 分钟</option>
        <option value={30}>每 30 分钟</option>
        <option value={60}>每 60 分钟</option>
      </NativeSelect>
    </Field>
    <label className="check-row"><input type="checkbox" checked={value.allowSelfSigned} onChange={(event) => set('allowSelfSigned', event.target.checked)} /><span><strong>允许这台 NAS 使用自签名 HTTPS 证书</strong><small>只在地址以 https:// 开头且浏览器提示证书不受信任时打开。</small></span></label>
    {showImportRecent ? <label className="check-row"><input type="checkbox" checked={value.importRecent} onChange={(event) => set('importRecent', event.target.checked)} /><span><strong>首次连接时转发当前消息</strong><small>最多读取消息中心最近 50 条。默认关闭，避免历史通知刷屏。</small></span></label> : null}
    <div className="security-note"><ShieldCheck size={18} weight="duotone" /><span>密码不会显示在页面、通知记录或日志中。</span></div>
  </fieldset>;
}
