-- Phase 2 playbooks: ECHO air/RCRA/NPDES + REFERRAL attribution follow-up
INSERT INTO "SignalPlaybook" ("id", "type", "subtype", "channel", "urgencyDays", "talkTrack") VALUES
('pb_echo_air', 'ENV_PERMIT', 'air_fce', 'email', 21,
 'Recent CAA evaluation activity at {{company}} ({{detail}}). Process / compliance work often shows up before a space ask — sharing our Greenville industrial snapshot.'),
('pb_echo_npdes', 'ENV_PERMIT', 'npdes_new', 'email', 21,
 'New NPDES coverage for {{company}} ({{detail}}). Wastewater capacity changes are a common precursor to expansion or a process line move.'),
('pb_rcra_up', 'GENERATOR_STATUS_CHANGE', 'rcra_increase', 'call', 14,
 '{{company}} stepped up RCRA generator status ({{detail}}). That usually means more haz volume and sometimes a larger or different box — open to a quiet facility conversation?'),
('pb_rcra_down', 'GENERATOR_STATUS_CHANGE', 'rcra_decrease', 'email', 21,
 'RCRA generator status decrease at {{company}} ({{detail}}). If a line is winding down, I can quietly canvass sublease / disposition interest.'),
('pb_referral', 'REFERRAL', '', 'call', 7,
 'Referral from {{detail}} on {{company}} — looping back with a short list of Greenville-Spartanburg industrial options that fit what they described.')
ON CONFLICT ("type", "subtype") DO NOTHING;
