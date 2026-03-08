"""Tests for constituent event filters."""

from app.scraper.filters import is_constituent_event


class TestIsConstituentEvent:
    # -- Events that SHOULD pass --
    def test_town_hall_passes(self):
        assert is_constituent_event("Town Hall Meeting") is True

    def test_community_event_passes(self):
        assert is_constituent_event("Community Meeting on Housing") is True

    def test_workshop_passes(self):
        assert is_constituent_event("Financial Literacy Workshop") is True

    def test_office_hours_passes(self):
        assert is_constituent_event("Mobile Office Hours") is True

    def test_resource_fair_passes(self):
        assert is_constituent_event("Annual Resource Fair") is True

    def test_generic_event_passes(self):
        assert is_constituent_event("Meet and Greet") is True

    # -- Events that SHOULD be excluded --
    def test_committee_hearing_excluded(self):
        assert is_constituent_event("Committee Hearing on Education") is False

    def test_committee_meeting_excluded(self):
        assert is_constituent_event("Committee Meeting") is False

    def test_subcommittee_excluded(self):
        assert is_constituent_event("Subcommittee on Water") is False

    def test_joint_hearing_excluded(self):
        assert is_constituent_event("Joint Hearing on Budget") is False

    def test_floor_session_excluded(self):
        assert is_constituent_event("Floor Session") is False

    def test_legislative_session_excluded(self):
        assert is_constituent_event("Legislative Session") is False

    def test_press_conference_excluded(self):
        assert is_constituent_event("Press Conference on New Bill") is False

    def test_press_briefing_excluded(self):
        assert is_constituent_event("Press Briefing") is False

    def test_caucus_meeting_excluded(self):
        assert is_constituent_event("Caucus Meeting") is False

    def test_oversight_hearing_excluded(self):
        assert is_constituent_event("Oversight Hearing") is False

    def test_budget_hearing_excluded(self):
        assert is_constituent_event("Budget Hearing on Transportation") is False

    def test_budget_markup_excluded(self):
        assert is_constituent_event("Budget Markup Session") is False

    def test_confirmation_hearing_excluded(self):
        assert is_constituent_event("Confirmation Hearing") is False

    def test_appropriations_excluded(self):
        assert is_constituent_event("Appropriations Review") is False

    def test_rules_committee_excluded(self):
        assert is_constituent_event("Rules Committee Review") is False

    def test_informational_hearing_excluded(self):
        assert is_constituent_event("Informational Hearing") is False

    def test_select_committee_excluded(self):
        assert is_constituent_event("Select Committee on Climate") is False

    # -- Edge cases --
    def test_excluded_in_details_field(self):
        assert is_constituent_event("Important Event", "This is a committee hearing") is False

    def test_case_insensitive(self):
        assert is_constituent_event("COMMITTEE HEARING") is False
        assert is_constituent_event("committee hearing") is False

    def test_media_availability_excluded(self):
        assert is_constituent_event("Media Availability") is False
