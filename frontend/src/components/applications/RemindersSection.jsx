/**
 * Follow-up reminders due, with a "mark as followed up" action per reminder.
 * @param {object} props
 * @param {{application_id: (string|number), title: string, company: string, days_since_update: number}[]} props.followUps
 * @param {number} props.followUpsDue
 * @param {(string|number|null)} props.updatingApplicationId
 * @param {(reminder: object) => void} props.onMarkFollowedUp
 */
export function RemindersSection({ followUps, followUpsDue, updatingApplicationId, onMarkFollowedUp }) {
  return (
    <section id="reminders" className="mt-14 border-t border-slate-200 pt-10" aria-labelledby="reminders-heading">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-600">Keep momentum</p>
          <h2 id="reminders-heading" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Follow-up reminders</h2>
        </div>
        <span className="text-sm font-semibold text-slate-500">{followUpsDue} due</span>
      </div>
      {followUps?.length ? (
        <div className="grid gap-3">
          {followUps.map((reminder) => (
            <article key={reminder.application_id} className="flex flex-col gap-4 rounded-xl border border-rose-100 bg-rose-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-950">{reminder.title}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">{reminder.company}</p>
                <p className="mt-1 text-sm text-slate-500">{reminder.days_since_update} days since last update</p>
              </div>
              <button
                type="button"
                onClick={() => onMarkFollowedUp(reminder)}
                disabled={updatingApplicationId === reminder.application_id}
                className="min-h-10 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updatingApplicationId === reminder.application_id ? 'Updating…' : 'Mark as followed up'}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">You are all caught up. No follow-ups are due.</p>
      )}
    </section>
  );
}