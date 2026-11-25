"""Refus exprimés dans la langue de l'utilisateur."""


class ErreurMetier(Exception):
    def __init__(self, message: str, statut: int = 400):
        super().__init__(message)
        self.message, self.statut = message, statut
