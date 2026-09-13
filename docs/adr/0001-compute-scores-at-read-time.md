# 0001: Compute combined relevancy score at read time, not stored

## Status
Accepted

## Context
Final UI score = average of company-level and job-level relevancy scores. 
Both are independently computed by the LLM at different times (company 
once on creation, job per scraper run).

## Decision
Compute (company.relevancy_score + job.relevancy_score) / 2 in the SQL 
query at read time. Never persist it as a column.

## Consequences
Avoids drift if either score is recomputed later (e.g. company rescan). 
Adds negligible query cost at this data scale (hundreds–low thousands of rows).