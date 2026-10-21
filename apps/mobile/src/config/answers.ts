//Services
import { AnswerService } from '@/services/answers'
import { NotificationService } from '@/services/notifications'

// A tool request's Allow and Deny answer it without the app coming up. On Android a button pressed
// with the app closed runs in a task, which the system looks for as the app's code loads: so it
// is set up here, from the app's entry, before anything is drawn.
NotificationService.onBackgroundAnswer(AnswerService.answer)
