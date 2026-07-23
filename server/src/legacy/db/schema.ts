import { legacyTable } from '../../repositories/prismaQueryRepository.js';

export const stays = legacyTable('stays');
export const destinations = legacyTable('destinations');
export const globalSeoSettings = legacyTable('global_seo_settings');
export const crmPipelines = legacyTable('crm_pipelines');
export const crmDeals = legacyTable('crm_deals');
export const crmClients = legacyTable('crm_clients');
export const mktgCampaigns = legacyTable('mktg_campaigns');
export const mktgAudiences = legacyTable('mktg_audiences');
export const mktgAutomations = legacyTable('mktg_automations');
export const promotionalOffers = legacyTable('promotional_offers');
export const offerItems = legacyTable('offer_items');
export const adCampaigns = legacyTable('ad_campaigns');
export const adSets = legacyTable('ad_sets');
export const adCreatives = legacyTable('ad_creatives');
export const campaignMetrics = legacyTable('campaign_metrics');
export const adPlatformConnections = legacyTable('ad_platform_connections');
export const mayaCampaignActions = legacyTable('maya_campaign_actions');
