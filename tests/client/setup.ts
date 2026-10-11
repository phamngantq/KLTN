import { configure } from '@testing-library/react';

// The server project (workerd) runs in parallel and can slow jsdom rendering;
// the 1s default made async queries flaky under full-suite load.
configure({ asyncUtilTimeout: 5000 });
