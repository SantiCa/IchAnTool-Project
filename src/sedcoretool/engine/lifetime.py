"""Tie the engine's child processes to the coordinator's lifetime.

On Windows the coordinator joins a Job Object that kills every member when its last handle closes, which happens
when the coordinator process ends for any reason, including a forced kill. This lets the desktop program end the
whole engine by killing only the coordinator, instead of waiting for a slow process-tree walk. Workers also watch
a private liveness pipe, so a failure to join the job (for example on an older system) still stops them.
"""

import ctypes
import sys

_JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
_JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000

# Kept referenced for the life of the process: closing the handle early would kill the coordinator itself.
_job_handle = None


def _structures():
    from ctypes import wintypes

    class IoCounters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in (
            'ReadOperationCount', 'WriteOperationCount', 'OtherOperationCount',
            'ReadTransferCount', 'WriteTransferCount', 'OtherTransferCount')]

    class BasicLimits(ctypes.Structure):
        _fields_ = [
            ('PerProcessUserTimeLimit', ctypes.c_int64), ('PerJobUserTimeLimit', ctypes.c_int64),
            ('LimitFlags', wintypes.DWORD), ('MinimumWorkingSetSize', ctypes.c_size_t),
            ('MaximumWorkingSetSize', ctypes.c_size_t), ('ActiveProcessLimit', wintypes.DWORD),
            ('Affinity', ctypes.c_size_t), ('PriorityClass', wintypes.DWORD), ('SchedulingClass', wintypes.DWORD)]

    class ExtendedLimits(ctypes.Structure):
        _fields_ = [
            ('BasicLimitInformation', BasicLimits), ('IoInfo', IoCounters),
            ('ProcessMemoryLimit', ctypes.c_size_t), ('JobMemoryLimit', ctypes.c_size_t),
            ('PeakProcessMemoryUsed', ctypes.c_size_t), ('PeakJobMemoryUsed', ctypes.c_size_t)]

    return ExtendedLimits


def bind_to_process_lifetime():
    """Make processes started from now on die with this one. Returns True when the OS guarantee is active.

    A side effect on the current process only; a no-op returning False off Windows or if the system refuses.
    """
    global _job_handle
    if sys.platform != 'win32' or _job_handle is not None:
        return _job_handle is not None
    try:
        kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel32.CreateJobObjectW.restype = ctypes.c_void_p
        kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p]
        kernel32.SetInformationJobObject.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
        kernel32.AssignProcessToJobObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        kernel32.GetCurrentProcess.restype = ctypes.c_void_p
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        job = kernel32.CreateJobObjectW(None, None)
        if not job:
            return False
        limits = _structures()()
        limits.BasicLimitInformation.LimitFlags = _JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if (not kernel32.SetInformationJobObject(job, _JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, ctypes.byref(limits), ctypes.sizeof(limits))
                or not kernel32.AssignProcessToJobObject(job, kernel32.GetCurrentProcess())):
            kernel32.CloseHandle(job)
            return False
        _job_handle = job
        return True
    except (OSError, AttributeError):
        return False
