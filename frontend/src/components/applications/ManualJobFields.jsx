import { useState } from 'react';
import { FormField } from '../ui/FormField';

const locations = [
  ['India', 'India'], ['Bengaluru', 'Bengaluru/Bangalore'], ['Noida', 'Noida'],
  ['Gurugram', 'Gurugram/Gurugaon'], ['Mumbai', 'Mumbai'], ['Pune', 'Pune'],
  ['Hyderabad', 'Hyderabad'], ['Chennai', 'Chennai'], ['Other', 'Other'],
];
const types = [['full-time', 'Full-time'], ['part-time', 'Part-time'], ['contract', 'Contract'], ['internship', 'Internship']];
const selectClass = 'mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

/** Manual job location and employment controls; selection state is local to the form. */
export function ManualJobFields() {
  const [location, setLocation] = useState('India');
  return (
    <>
      <label className="text-sm font-semibold text-slate-700">
        Job type
        <select className={selectClass} name="job_type" defaultValue="full-time">
          {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Location
        <select className={selectClass} name="location" value={location} onChange={(event) => setLocation(event.target.value)}>
          {locations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {location === 'Other' && <FormField label="Country" name="country" placeholder="e.g. United Kingdom" required />}
    </>
  );
}
