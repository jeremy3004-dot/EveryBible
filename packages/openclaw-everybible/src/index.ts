import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

import {
  createGetHomepageContentTool,
  createUpdateHomepageContentTool,
} from './tools/homepage';
import {
  createGetContentHealthSummaryTool,
  createGetTranslationSummaryTool,
  createListRecentAdminActionsTool,
} from './tools/operational-summary';
import { createRequestCodeChangeTool } from './tools/code-change-request';

export default definePluginEntry({
  id: 'everybible',
  name: 'EveryBible Operator Tools',
  description:
    'Narrow EveryBible tools for homepage updates, operational summaries, and code-change escalation.',
  register(api) {
    api.registerTool((context) => createGetHomepageContentTool(context));
    api.registerTool((context) => createGetContentHealthSummaryTool(context));
    api.registerTool((context) => createGetTranslationSummaryTool(context));
    api.registerTool((context) => createListRecentAdminActionsTool(context));
    api.registerTool((context) => createUpdateHomepageContentTool(context), {
      optional: true,
      name: 'update_homepage_content',
    });
    api.registerTool((context) => createRequestCodeChangeTool(context), {
      optional: true,
      name: 'request_code_change',
    });
  },
});
