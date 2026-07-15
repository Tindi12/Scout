import logging
logger = logging.getLogger(__name__)


def detect_portal(url: str, portal: str = "unknown") -> str:
    if portal != "unknown":
        result = portal
    elif "greenhouse.io" in url:
        result = "greenhouse"
    elif "lever.co" in url:
        result = "lever"
    elif "ashbyhq.com" in url:
        result = "ashby"
    elif "myworkdayjobs.com" in url:
        result = "workday"
    elif "smartrecruiters.com" in url:
        result = "smartrecruiters"
    elif "workable.com" in url:
        result = "workable"
    elif "recruitee.com" in url:
        result = "recruitee"
    elif "bamboohr.com" in url:
        result = "bamboohr"
    elif "teamtailor.com" in url:
        result = "teamtailor"
    elif "icims.com" in url:
        result = "icims"
    elif "usajobs.gov" in url:
        result = "usajobs"
    else:
        result = "unknown"

    logger.info(f"Portal detected: {result} for {url[:50]}")
    return result
