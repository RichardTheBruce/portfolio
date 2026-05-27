export type BrainNode = {
  id: string;
  label: string;
  cluster: "nuro" | "2gather" | "lineage" | "memetropolis" | "mythos" | "scalar" | "voice";
  weight: number;
  excerpt?: string;
};

export type BrainEdge = {
  source: string;
  target: string;
};

export const brainClusterColor: Record<BrainNode["cluster"], string> = {
  nuro: "#C97D3E",
  "2gather": "#3FA66B",
  lineage: "#1E96E6",
  memetropolis: "#7E5BCC",
  mythos: "#F5F2EC",
  scalar: "#F7E6D0",
  voice: "#C72A8E",
};

export const brainNodes: BrainNode[] = [
  { id: "n_root", label: "Mythos", cluster: "mythos", weight: 18, excerpt: "Cross-project agent neural net. The substrate." },
  { id: "n_nuro_root", label: "Nuro Finance", cluster: "nuro", weight: 16 },
  { id: "n_nuro_afi", label: "AFI mainnet", cluster: "nuro", weight: 10 },
  { id: "n_nuro_sprint", label: "Sprint 2.3", cluster: "nuro", weight: 8 },
  { id: "n_nuro_chains", label: "23 chains", cluster: "nuro", weight: 9 },
  { id: "n_nuro_layerzero", label: "LayerZero V2", cluster: "nuro", weight: 8 },
  { id: "n_nuro_cctp", label: "Circle CCTP", cluster: "nuro", weight: 7 },
  { id: "n_nuro_visa", label: "Visa rails", cluster: "nuro", weight: 6 },
  { id: "n_nuro_x402", label: "x402 native", cluster: "nuro", weight: 5 },
  { id: "n_nuro_observe", label: "Observe-only flags", cluster: "nuro", weight: 4 },
  { id: "n_nuro_gate", label: "Gate-check", cluster: "nuro", weight: 5 },

  { id: "n_2g_root", label: "2gather", cluster: "2gather", weight: 14 },
  { id: "n_2g_mobile", label: "Expo SDK 54", cluster: "2gather", weight: 7 },
  { id: "n_2g_supabase", label: "Supabase", cluster: "2gather", weight: 7 },
  { id: "n_2g_marathon", label: "4-sprint marathon", cluster: "2gather", weight: 8 },
  { id: "n_2g_stitch", label: "Stitch HTMLs", cluster: "2gather", weight: 6 },
  { id: "n_2g_realtime", label: "Realtime channels", cluster: "2gather", weight: 5 },
  { id: "n_2g_friendships", label: "Friendships", cluster: "2gather", weight: 4 },
  { id: "n_2g_pins", label: "Pin feed", cluster: "2gather", weight: 5 },

  { id: "n_lin_root", label: "Lineage", cluster: "lineage", weight: 13 },
  { id: "n_lin_kernel", label: "10-phase kernel", cluster: "lineage", weight: 9 },
  { id: "n_lin_intake", label: "Intake loop", cluster: "lineage", weight: 8 },
  { id: "n_lin_nn4e", label: "Neural Nets for Everything", cluster: "lineage", weight: 11 },
  { id: "n_lin_upwork", label: "Upwork catalog", cluster: "lineage", weight: 6 },
  { id: "n_lin_vault", label: "Personal vault", cluster: "lineage", weight: 6 },
  { id: "n_lin_metapatterns", label: "Meta-patterns", cluster: "lineage", weight: 5 },

  { id: "n_meme_root", label: "Memetropolis", cluster: "memetropolis", weight: 12 },
  { id: "n_meme_launch", label: "$300K launchpad", cluster: "memetropolis", weight: 8 },
  { id: "n_meme_oapp", label: "OApp / OFT", cluster: "memetropolis", weight: 6 },
  { id: "n_meme_subgraph", label: "The Graph", cluster: "memetropolis", weight: 5 },
  { id: "n_meme_contracts", label: "Solidity contracts", cluster: "memetropolis", weight: 6 },

  { id: "n_sc_root", label: "Scalar physics", cluster: "scalar", weight: 10 },
  { id: "n_sc_critical", label: "Critical point (2,7,19)", cluster: "scalar", weight: 7 },
  { id: "n_sc_spin", label: "Spin 1.5", cluster: "scalar", weight: 5 },
  { id: "n_sc_tilt", label: "Tilt 0.5", cluster: "scalar", weight: 4 },
  { id: "n_sc_strings", label: "Blue vector strings", cluster: "scalar", weight: 9 },
  { id: "n_sc_oscillation", label: "Wave oscillation", cluster: "scalar", weight: 6 },
  { id: "n_sc_keys", label: "Keys to heaven", cluster: "scalar", weight: 5 },
  { id: "n_sc_probability", label: "Probability 14-D", cluster: "scalar", weight: 7 },
  { id: "n_sc_field", label: "Optimized field structure", cluster: "scalar", weight: 6 },

  { id: "n_v_root", label: "He who creates", cluster: "voice", weight: 9 },
  { id: "n_v_founder", label: "Founder voice", cluster: "voice", weight: 6 },
  { id: "n_v_specific", label: "Specific over abstract", cluster: "voice", weight: 5 },
  { id: "n_v_gblock", label: "GBlock", cluster: "voice", weight: 7 },
  { id: "n_v_linkedin", label: "richard-wayne-nuro", cluster: "voice", weight: 5 },

  { id: "n_m_agents", label: "Agent CRM", cluster: "mythos", weight: 7 },
  { id: "n_m_skills", label: "Skills library", cluster: "mythos", weight: 6 },
  { id: "n_m_intelligence", label: "Intelligence pipeline", cluster: "mythos", weight: 7 },
  { id: "n_m_levers", label: "Preventive levers 1-18", cluster: "mythos", weight: 8 },
  { id: "n_m_encode", label: "/encode ritual", cluster: "mythos", weight: 5 },
  { id: "n_m_decode", label: "/decode ritual", cluster: "mythos", weight: 5 },
  { id: "n_m_corpus", label: "Visual corpus", cluster: "mythos", weight: 6 },
];

export const brainEdges: BrainEdge[] = [
  { source: "n_root", target: "n_nuro_root" },
  { source: "n_root", target: "n_2g_root" },
  { source: "n_root", target: "n_lin_root" },
  { source: "n_root", target: "n_meme_root" },
  { source: "n_root", target: "n_sc_root" },
  { source: "n_root", target: "n_v_root" },
  { source: "n_root", target: "n_m_agents" },
  { source: "n_root", target: "n_m_skills" },
  { source: "n_root", target: "n_m_intelligence" },
  { source: "n_root", target: "n_m_levers" },
  { source: "n_root", target: "n_m_encode" },
  { source: "n_root", target: "n_m_decode" },
  { source: "n_root", target: "n_m_corpus" },

  { source: "n_nuro_root", target: "n_nuro_afi" },
  { source: "n_nuro_root", target: "n_nuro_sprint" },
  { source: "n_nuro_root", target: "n_nuro_chains" },
  { source: "n_nuro_root", target: "n_nuro_layerzero" },
  { source: "n_nuro_root", target: "n_nuro_cctp" },
  { source: "n_nuro_root", target: "n_nuro_visa" },
  { source: "n_nuro_root", target: "n_nuro_x402" },
  { source: "n_nuro_root", target: "n_nuro_observe" },
  { source: "n_nuro_root", target: "n_nuro_gate" },
  { source: "n_nuro_chains", target: "n_nuro_layerzero" },
  { source: "n_nuro_chains", target: "n_nuro_cctp" },

  { source: "n_2g_root", target: "n_2g_mobile" },
  { source: "n_2g_root", target: "n_2g_supabase" },
  { source: "n_2g_root", target: "n_2g_marathon" },
  { source: "n_2g_root", target: "n_2g_stitch" },
  { source: "n_2g_root", target: "n_2g_realtime" },
  { source: "n_2g_root", target: "n_2g_friendships" },
  { source: "n_2g_root", target: "n_2g_pins" },
  { source: "n_2g_marathon", target: "n_2g_stitch" },

  { source: "n_lin_root", target: "n_lin_kernel" },
  { source: "n_lin_root", target: "n_lin_intake" },
  { source: "n_lin_root", target: "n_lin_nn4e" },
  { source: "n_lin_root", target: "n_lin_upwork" },
  { source: "n_lin_root", target: "n_lin_vault" },
  { source: "n_lin_kernel", target: "n_lin_intake" },
  { source: "n_lin_vault", target: "n_lin_metapatterns" },

  { source: "n_meme_root", target: "n_meme_launch" },
  { source: "n_meme_root", target: "n_meme_oapp" },
  { source: "n_meme_root", target: "n_meme_subgraph" },
  { source: "n_meme_root", target: "n_meme_contracts" },
  { source: "n_meme_oapp", target: "n_nuro_layerzero" },

  { source: "n_sc_root", target: "n_sc_critical" },
  { source: "n_sc_root", target: "n_sc_spin" },
  { source: "n_sc_root", target: "n_sc_tilt" },
  { source: "n_sc_root", target: "n_sc_strings" },
  { source: "n_sc_root", target: "n_sc_oscillation" },
  { source: "n_sc_root", target: "n_sc_keys" },
  { source: "n_sc_root", target: "n_sc_probability" },
  { source: "n_sc_root", target: "n_sc_field" },
  { source: "n_sc_strings", target: "n_sc_oscillation" },
  { source: "n_sc_strings", target: "n_sc_keys" },
  { source: "n_sc_probability", target: "n_sc_field" },

  { source: "n_v_root", target: "n_v_founder" },
  { source: "n_v_root", target: "n_v_specific" },
  { source: "n_v_root", target: "n_v_gblock" },
  { source: "n_v_root", target: "n_v_linkedin" },

  { source: "n_v_root", target: "n_root" },
  { source: "n_sc_strings", target: "n_meme_root" },
  { source: "n_sc_keys", target: "n_lin_nn4e" },
  { source: "n_nuro_root", target: "n_meme_oapp" },
  { source: "n_lin_nn4e", target: "n_root" },
  { source: "n_m_levers", target: "n_nuro_gate" },
  { source: "n_m_corpus", target: "n_sc_field" },
];
