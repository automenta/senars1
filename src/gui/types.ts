import { Task } from '../core/models';

export interface GuiTask extends Task {
  content: string;
  priority_text: string;
  related_to?: string;
  next_step?: string;
  created_ago?: string;
  retains_for?: string;
  path_history?: string;
  source?: string;
  completed_ago?: string;
  verification_status?: string;
  knowledge_retention?: string;
}
