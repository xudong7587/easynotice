export function buildOpenWrtPushBotConfig(endpointUrl: string): string {
  return JSON.stringify({
    url: endpointUrl,
    data: '@${tempjsonpath}',
    content_type: 'Content-Type: application/json',
    str_title_start: '',
    str_title_end: '',
    str_linefeed: '\\n',
    str_splitline: '\\n----\\n',
    str_space: ' ',
    str_tab: '    ',
    table_tab: '│ ',
    font_success: '',
    font_client: '',
    font_fail: '',
    font_module: '',
    font_title: '',
    font_end: '',
    font_end2: '',
    percentsym: '25',
    boldstar: '',
    type: {
      title: '"${1}"',
      content: '"${nowtime}${str_linefeed}${2}"',
      event: '"openwrt_notice"',
    },
  }, null, 2);
}
