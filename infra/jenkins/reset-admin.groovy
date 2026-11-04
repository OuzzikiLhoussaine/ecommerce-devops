import jenkins.model.*
import hudson.model.User
import hudson.security.HudsonPrivateSecurityRealm

println "[reset-admin-password] begin"
def user = User.getById("admin", true)
user.addProperty(HudsonPrivateSecurityRealm.Details.fromPlainPassword("devops-2026"))
user.save()
println "[reset-admin-password] done"
